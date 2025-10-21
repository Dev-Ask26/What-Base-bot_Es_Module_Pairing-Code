// ==================== handler.js ====================
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import decodeJid from "./system/decodeJid.js";
import checkAdminOrOwner from "./system/checkAdminOrOwner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commands = new Map();

// Cache par session pour éviter les conflits
global.groupCache = global.groupCache || {};
global.sessionConfigs = global.sessionConfigs || new Map();

const commandsDir = path.join(__dirname, "commands");

// ==================== Charger la configuration pour une session ====================
function loadConfigForSession(sessionName) {
  try {
    const configPath = path.join(__dirname, "config.json");
    if (!fs.existsSync(configPath)) {
      console.log("❌ Fichier config.json non trouvé");
      return { PREFIX: '.', MODE: 'public', BOT_NAME: 'ASK CRASHER', sessions: [] };
    }

    const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));

    // DEBUG: Afficher ce qu'on trouve
    console.log(`🔍 Recherche config pour session: ${sessionName}`);
    console.log(`📋 Sessions disponibles:`, configData.sessions?.map(s => s.name) || []);

    // Trouver la configuration spécifique à cette session
    const sessionConfig = configData.sessions?.find(s => s.name === sessionName);
    
    if (sessionConfig) {
      console.log(`✅ Config trouvée pour ${sessionName}:`, {
        prefix: sessionConfig.prefix,
        mode: sessionConfig.mode,
        owner: sessionConfig.ownerNumber
      });
      
      return {
        PREFIX: sessionConfig.prefix || '.',
        MODE: sessionConfig.mode || 'public',
        BOT_NAME: configData.BOT_NAME || 'ASK CRASHER',
        OWNER_NUMBER: sessionConfig.ownerNumber,
        SUDO: sessionConfig.sudo || [],
        ...sessionConfig
      };
    }

    console.log(`❌ Aucune config trouvée pour ${sessionName}, utilisation des valeurs par défaut`);
    return { 
      PREFIX: '.', 
      MODE: 'public', 
      BOT_NAME: configData.BOT_NAME || 'ASK CRASHER',
      OWNER_NUMBER: '', 
      SUDO: [] 
    };
  } catch (error) {
    console.error('❌ Erreur chargement config session:', error);
    return { 
      PREFIX: '.', 
      MODE: 'public', 
      BOT_NAME: 'ASK CRASHER',
      OWNER_NUMBER: '', 
      SUDO: [] 
    };
  }
}

// ==================== Obtenir le nom de session depuis la socket ====================
function getSessionName(devask) {
  // Plusieurs méthodes pour récupérer le nom de session
  const sessionName = devask.sessionName || 
                    devask.user?.id?.split(':')[0] || 
                    'default';
  
  console.log(`🔧 Session détectée: ${sessionName}`);
  return sessionName;
}

// ==================== Obtenir la config pour une session ====================
function getSessionConfig(devask) {
  const sessionName = getSessionName(devask);

  // Vérifier si la config est en cache et toujours valide
  if (!global.sessionConfigs.has(sessionName)) {
    console.log(`🔄 Chargement config pour session: ${sessionName}`);
    const config = loadConfigForSession(sessionName);
    global.sessionConfigs.set(sessionName, config);
  }

  const config = global.sessionConfigs.get(sessionName);
  
  // DEBUG: Afficher la config utilisée
  console.log(`⚙️ Config utilisée pour ${sessionName}:`, {
    prefix: config.PREFIX,
    mode: config.MODE,
    owner: config.OWNER_NUMBER
  });

  return config;
}

// ==================== Charger toutes les commandes dynamiquement ====================
async function loadCommands() {
  const files = fs.readdirSync(commandsDir);
  for (const file of files) {
    if (file.endsWith(".js")) {
      try {
        const filePath = path.join(commandsDir, file);
        const fileUrl = pathToFileURL(filePath).href;
        if (import.meta.resolve) delete import.meta.resolve[fileUrl];

        const { default: cmd } = await import(`./commands/${file}?update=${Date.now()}`);
        if (cmd?.name && typeof cmd.run === "function") {
          commands.set(cmd.name, cmd);
          console.log(`✅ Commande chargée: ${cmd.name}`);
        }
      } catch (err) {
        console.error(`❌ Erreur chargement ${file}:`, err);
      }
    }
  }
}

// Initial load
await loadCommands();

// Watcher pour recharger automatiquement les nouvelles commandes
fs.watch(commandsDir, { recursive: false }, async (eventType, filename) => {
  if (filename && filename.endsWith(".js")) {
    console.log(`🔄 Détection de modification / ajout de commande: ${filename}`);
    await loadCommands();
  }
});

// Watcher pour recharger les configurations quand config.json change
const configPath = path.join(__dirname, "config.json");
if (fs.existsSync(configPath)) {
  fs.watchFile(configPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      console.log('🔄 Détection changement config.json, rechargement des configurations...');
      global.sessionConfigs.clear(); // Vider le cache pour forcer le rechargement
    }
  });
}

function getChatType(jid) {
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@s.whatsapp.net")) return "dm";
  if (jid.endsWith("@newsletter")) return "channel";
  return "community";
}

// ==================== Vérifier le préfixe avec la config de session ====================
function checkPrefix(body, prefix) {
  // Vérifier si le message commence par le préfixe de la session
  const startsWithPrefix = body.startsWith(prefix);
  
  // DEBUG
  if (startsWithPrefix) {
    console.log(`✅ Préfixe "${prefix}" détecté dans: "${body}"`);
  } else {
    console.log(`❌ Préfixe "${prefix}" NON détecté dans: "${body}"`);
  }
  
  return startsWithPrefix;
}

// ==================== Handler principal multi-sessions ====================
async function handler(devask, m, msg, rawMsg) {
  try {
    const sessionName = getSessionName(devask);
    const config = getSessionConfig(devask);

    console.log(`🎯 Handler appelé pour session: ${sessionName}`);
    console.log(`📝 Message reçu:`, m.text?.substring(0, 50) + '...');

    // Initialiser le cache de groupe pour cette session si nécessaire
    if (!global.groupCache[sessionName]) {
      global.groupCache[sessionName] = {};
    }

    const sessionGroupCache = global.groupCache[sessionName];
    const userId = decodeJid(m.sender);
    const chatId = decodeJid(m.chat);
    const isGroup = m.isGroup ?? chatId.endsWith("@g.us");

    // Récupération du texte de la commande
    let body = (
      m.mtype === "conversation" ? m.message.conversation :
      m.mtype === "imageMessage" ? m.message.imageMessage.caption :
      m.mtype === "videoMessage" ? m.message.videoMessage.caption :
      m.mtype === "extendedTextMessage" ? m.message.extendedTextMessage.text :
      m.mtype === "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
      m.mtype === "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
      m.mtype === "interactiveResponseMessage" ? (() => {
        try {
          return JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
        } catch {
          return "";
        }
      })() :
      m.mtype === "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
      m.mtype === "messageContextInfo" ?
        m.message.buttonsResponseMessage?.selectedButtonId ||
        m.message.listResponseMessage?.singleSelectReply.selectedRowId ||
        m.message.interactiveResponseMessage?.nativeFlowResponseMessage ||
        m.text :
      ""
    );

    if (!body) body = "";
    const budy = (typeof m.text === "string" ? m.text : "");

    console.log(`🔤 Texte analysé: "${body}"`);
    console.log(`🔠 Préfixe attendu: "${config.PREFIX}"`);

    // VÉRIFICATION CRITIQUE : Utiliser le préfixe de la session
    if (!checkPrefix(body, config.PREFIX)) {
      console.log(`🚫 Message ignoré - ne commence pas par le préfixe "${config.PREFIX}"`);
      return;
    }

    const args = body.slice(config.PREFIX.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const sender = m.sender || m.key.participant || m.key.remoteJid;

    console.log(`📋 Commande détectée: ${command}, Args:`, args);

    // -------- Récupération metadata & permissions --------
    let metadata = null;
    let participants = [];
    let isOwner = false;
    let isAdmins = false;
    let isSudo = false;
    let isAdminOrOwner = false;
    let isBotAdmins = false;

    if (isGroup) {
      try {
        if (!sessionGroupCache[chatId]) {
          metadata = await devask.groupMetadata(chatId);
          participants = metadata.participants || [];
          sessionGroupCache[chatId] = { metadata, participants };
        } else {
          metadata = sessionGroupCache[chatId].metadata;
          participants = sessionGroupCache[chatId].participants;
        }

        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, config);
        isAdmins = perms.isAdmin;
        isOwner = perms.isOwner;
        isSudo = perms.isSudo;
        isAdminOrOwner = perms.isAdminOrOwner;

        const botPerms = await checkAdminOrOwner(devask, chatId, decodeJid(devask.user?.id), participants, metadata, config);
        isBotAdmins = botPerms.isAdmin;
      } catch (e) {
        console.error(`❌ Erreur metadata session ${sessionName}:`, e);
      }
    } else {
      try {
        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, config);
        isOwner = perms.isOwner;
        isSudo = perms.isSudo;
        isAdminOrOwner = perms.isAdminOrOwner;
      } catch (e) {
        console.error(`❌ Erreur permissions privé session ${sessionName}:`, e);
      }
    }

    console.log(`👤 Permissions - Owner: ${isOwner}, Sudo: ${isSudo}, Admin: ${isAdmins}`);

    // Vérif si commande existe
    if (!commands.has(command)) {
      console.log(`❌ Commande non trouvée: ${command}`);
      await devask.sendMessage(chatId, { react: { text: "❌", key: m.key } });

      await devask.sendMessage(chatId, {
        text: `❌ Commande *${command}* non reconnue.\n\n📌 Tapez *${config.PREFIX}menu* pour voir les options disponibles.`,
        contextInfo: {
          externalAdReply: {
            title: `${config.BOT_NAME} 🚫`,
            body: "WHATSAPP BOT MULTI-SESSIONS",
            thumbnailUrl: "https://files.catbox.moe/zq1kuc.jpg",
            sourceUrl: "https://whatsapp.com/channel/0029VaiPkRPLY6d0qEX50e2k"
          }
        }
      }, { quoted: m });

      return;
    }

    // VÉRIFICATION CRITIQUE : Mode privé avec config de session
    if (config.MODE === "private" && !isOwner && !isSudo) {
      console.log(`🚫 Mode privé activé - Accès refusé pour ${userId}`);
      return devask.sendMessage(chatId, {
        text: `*🚫 ${config.BOT_NAME} est en mode privé.*\n_Seule l'owner et les sudo peuvent utiliser les commandes._\n\n👤 Owner: ${config.OWNER_NUMBER}`
      }, { quoted: rawMsg });
    }

    const cmd = commands.get(command);
    console.log(`🎯 Exécution commande: ${command} (${cmd.name})`);

    // Vérifs automatiques via flags dans la commande
    if (cmd.ownerOnly && !isOwner) {
      console.log(`🚫 Commande ownerOnly refusée pour ${userId}`);
      return devask.sendMessage(chatId, { text: "🚫 Commande réservée au propriétaire." }, { quoted: rawMsg });
    }
    if (cmd.sudoOnly && !isSudo && !isOwner) {
      console.log(`🚫 Commande sudoOnly refusée pour ${userId}`);
      return devask.sendMessage(chatId, { text: "🚫 Commande réservée aux sudo/owner." }, { quoted: rawMsg });
    }
    if (cmd.groupOnly && !isGroup) {
      console.log(`🚫 Commande groupOnly en privé`);
      return devask.sendMessage(chatId, { text: "❌ Cette commande doit être utilisée dans un groupe." }, { quoted: rawMsg });
    }
    if (cmd.adminOnly && !isAdmins) {
      console.log(`🚫 Commande adminOnly pour non-admin`);
      return devask.sendMessage(chatId, { text: "⛔ Seuls les admins peuvent utiliser cette commande." }, { quoted: rawMsg });
    }
    if (cmd.botAdminOnly && !isBotAdmins) {
      console.log(`🚫 Commande botAdminOnly - bot non admin`);
      return devask.sendMessage(chatId, { text: "⚠️ Je dois être admin pour exécuter cette commande." }, { quoted: rawMsg });
    }

    // Exécution de la commande avec la config de session
    console.log(`🚀 Lancement de la commande: ${command}`);
    await cmd.run(devask, m, msg, args, {
      isGroup,
      metadata,
      participants,
      isAdmins,
      isOwner,
      isSudo,
      isAdminOrOwner,
      isBotAdmins,
      body,
      budy,
      chatType: getChatType(chatId),
      sender: userId,
      config: config,
      sessionName: sessionName
    });

    console.log(`✅ Commande ${command} exécutée avec succès`);

  } catch (err) {
    console.error("❌ Erreur Handler:", err);
    try {
      await devask.sendMessage(m.chat, { text: "⚠️ Une erreur est survenue lors du traitement de la commande." }, { quoted: m });
    } catch {}
  }
}

export default handler;