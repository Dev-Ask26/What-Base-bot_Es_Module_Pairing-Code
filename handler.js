// ==================== handler.js ====================
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import decodeJid from "./system/decodeJid.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commands = new Map();
global.groupCache = {};

const commandsDir = path.join(__dirname, "commands");

// Charger toutes les commandes dynamiquement
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

// ========== FONCTIONS MULTI-UTILISATEUR ISOLÉES ==========

// Charger les configurations utilisateur
function loadUserConfig(file) {
  try {
    const data = fs.readFileSync(`./database/${file}`, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Erreur lecture ${file}:`, error);
    return {};
  }
}

// Sauvegarder les configurations utilisateur
function saveUserConfig(file, data) {
  try {
    fs.writeFileSync(`./database/${file}`, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`❌ Erreur sauvegarde ${file}:`, error);
    return false;
  }
}

// Obtenir le préfixe d'un utilisateur
function getUserPrefix(userId) {
  const prefixes = loadUserConfig("prefix.json");
  return prefixes[userId] || "."; // Préfixe par défaut
}

// Obtenir le mode d'un utilisateur
function getUserMode(userId) {
  const modes = loadUserConfig("mode.json");
  return modes[userId] || "public"; // Mode par défaut
}

// Vérifier si un utilisateur est sudo (pour un owner spécifique)
function isUserSudo(userId, ownerId = null) {
  const sudoData = loadUserConfig("sudo.json");
  
  // Si on cherche si userId est sudo d'un owner spécifique
  if (ownerId) {
    return sudoData[ownerId]?.includes(userId) || false;
  }
  
  // Sinon, vérifier si userId est sudo de n'importe quel owner
  for (const owner in sudoData) {
    if (sudoData[owner].includes(userId)) {
      return true;
    }
  }
  return false;
}

// Obtenir la liste des sudo d'un utilisateur
function getUserSudoList(userId) {
  const sudoData = loadUserConfig("sudo.json");
  return sudoData[userId] || [];
}

function getChatType(jid) {
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@s.whatsapp.net")) return "dm";
  if (jid.endsWith("@newsletter")) return "channel";
  return "community";
}

// ==================== Handler principal ====================
async function handler(devask, m, msg, rawMsg) {
  try {
    const userId = decodeJid(m.sender);
    const chatId = decodeJid(m.chat);
    
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

    // ========== CONFIGURATION PERSONNELLE DE L'UTILISATEUR ==========
    const userPrefix = getUserPrefix(userId);
    const userMode = getUserMode(userId);
    const userSudo = isUserSudo(userId); // Vérifie si l'utilisateur est sudo de n'importe qui
    const userSudoList = getUserSudoList(userId); // Liste des sudo de CET utilisateur

    // Vérification avec le préfixe PERSONNEL de l'utilisateur
    if (!body.startsWith(userPrefix)) return;
    
    const args = body.slice(userPrefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();

    // ========== GESTION DES PERMISSIONS ==========
    const botNumber = decodeJid(devask.user?.id);
    
    // Détermination des permissions
    const isOwner = [botNumber].includes(m.sender) || m.isOwner || false;
    const isSudo = userSudo; // Utilise le statut sudo global
    const isGroup = m.chat.endsWith('@g.us');
    
    let groupMetadata = {};
    let participant_bot = {};
    let groupName = "";
    let participants = [];
    let isBotAdmins = false;
    let isAdmins = false;

    if (isGroup) {
      try {
        groupMetadata = await devask.groupMetadata(m.chat);
        participant_bot = groupMetadata.participants.find((v) => v.id === botNumber) || {};
        groupName = groupMetadata.subject || "";
        participants = groupMetadata.participants || [];
        
        // Vérification des admins
        isBotAdmins = participant_bot?.admin !== null && participant_bot?.admin !== undefined;
        
        const senderParticipant = participants.find(p => p.id === m.sender) || {};
        isAdmins = senderParticipant?.admin !== null && senderParticipant?.admin !== undefined;
      } catch (error) {
        console.error("❌ Erreur group metadata:", error);
      }
    }

    // Vérif si commande existe
    if (!commands.has(command)) {
      await devask.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      await devask.sendMessage(chatId, {
        text: `❌ Commande *${command}* non reconnue.\n\n📌 Tapez *${userPrefix}menu* pour voir les options disponibles.\n🔧 Votre préfixe personnel: *${userPrefix}*`
      }, { quoted: m });
      return;
    }

    // Vérif mode PERSONNEL (privé/public)
    if (userMode === "private" && !isOwner && !isSudo) {
      return devask.sendMessage(chatId, {
        text: `*🚫 Votre session est en mode privé.*\n_Seule l'owner et les sudo peuvent utiliser vos commandes._\n🔧 Votre mode personnel: *${userMode}*`
      }, { quoted: rawMsg });
    }

    const cmd = commands.get(command);

    // ========== EXÉCUTION DE LA COMMANDE ==========
    await cmd.run(devask, m, msg, args, {
      // Permissions
      isGroup,
      isAdmins,
      isOwner,
      isSudo,
      isAdminOrOwner: isAdmins || isOwner || isSudo,
      isBotAdmins,
      
      // Métadonnées groupe
      metadata: groupMetadata,
      participants,
      participant_bot,
      groupName,
      
      // Message
      body,
      budy,
      chatType: getChatType(chatId),
      sender: userId,
      
      // ⭐ CONFIGURATION PERSONNELLE DE L'UTILISATEUR
      userPrefix,        // Son préfixe à lui
      userMode,          // Son mode à lui  
      userSudo,          // Son statut sudo global
      userSudoList,      // Sa liste personnelle de sudo
      
      // Fonctions de gestion
      loadUserConfig,
      saveUserConfig,
      getUserPrefix,
      getUserMode,
      isUserSudo,
      getUserSudoList
    });

  } catch (err) {
    console.error("❌ Erreur Handler:", err);
    try {
      await devask.sendMessage(m.chat, { text: "⚠️ Une erreur est survenue." }, { quoted: m });
    } catch {}
  }
}

export default handler;