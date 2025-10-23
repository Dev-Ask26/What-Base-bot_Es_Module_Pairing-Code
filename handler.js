// ==================== handler.js ====================
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url"; // Ajout de pathToFileURL ici
import { getSessionConfig } from "./config.js";  // Import de la fonction
import decodeJid from "./system/decodeJid.js";
import checkAdminOrOwner from "./system/checkAdminOrOwner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commands = new Map();
global.groupCache = {}; // cache pour éviter trop d'appels groupMetadata

const commandsDir = path.join(__dirname, "commands");

// Charger toutes les commandes dynamiquement
async function loadCommands() {
  const files = fs.readdirSync(commandsDir);
  for (const file of files) {
    if (file.endsWith(".js")) {
      try {
        // Supprime le module du cache avant de le recharger
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

function getChatType(jid) {
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@s.whatsapp.net")) return "dm";
  if (jid.endsWith("@newsletter")) return "channel";
  return "community";
}

// ==================== Handler principal ====================
async function handler(devask, m, msg, rawMsg) {
  try {
    // Récupère la config spécifique à la session
    const sessionConfig = getSessionConfig(devask.sessionId);

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

    // Vérifie le préfixe spécifique à la session
    if (!body.startsWith(sessionConfig.prefix)) return;
    const args = body.slice(sessionConfig.prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const sender = m.sender || m.key.participant || m.key.remoteJid;

    // -------- Récupération metadata & permissions --------
    let metadata = null;
    let participants = [];
    let isOwner = false;
    let isAdmins = false;
    let isSudo = false; // ← Cette variable reste false si pas assignée
    let isAdminOrOwner = false;
    let isBotAdmins = false;

    if (isGroup) {
      try {
        if (!global.groupCache[chatId]) {
          metadata = await devask.groupMetadata(chatId);
          participants = metadata.participants || [];
          global.groupCache[chatId] = { metadata, participants };
        } else {
          metadata = global.groupCache[chatId].metadata;
          participants = global.groupCache[chatId].participants;
        }

        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, sessionConfig);
        isAdmins = perms.isAdmin;
        isOwner = perms.isOwner;
        isSudo = perms.isSudo; // ← AJOUT IMPORTANT: Assigner isSudo
        isAdminOrOwner = perms.isAdminOrOwner;

        // Vérif bot
        const botPerms = await checkAdminOrOwner(devask, chatId, decodeJid(devask.user?.id), participants, metadata, sessionConfig);
        isBotAdmins = botPerms.isAdmin;
      } catch (e) {
        console.error("❌ Erreur metadata:", e);
      }
    } else {
      // ← AJOUT: Gestion des permissions en privé
      try {
        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, sessionConfig);
        isOwner = perms.isOwner;
        isSudo = perms.isSudo; // ← AJOUT: Assigner isSudo en privé aussi
        isAdminOrOwner = perms.isAdminOrOwner;
      } catch (e) {
        console.error("❌ Erreur permissions privé:", e);
      }
    }

    // Vérif si commande existe
    if (!commands.has(command)) {
      await devask.sendMessage(chatId, { react: { text: "❌", key: m.key } });

      await devask.sendMessage(chatId, {
        text: `❌ Commande *${command}* non reconnue.\n\n📌 Tapez *${sessionConfig.prefix}menu* pour voir les options disponibles.`,
        contextInfo: {
          externalAdReply: {
            title: "ASK CRASHER 🚫",
            body: "WHATSAPP BUG BOT",
            thumbnailUrl: "https://files.catbox.moe/zq1kuc.jpg",
            sourceUrl: "https://whatsapp.com/channel/0029VaiPkRPLY6d0qEX50e2k"
          }
        }
      }, { quoted: m });

      return; // stoppe l'exécution
    }

    // Vérif mode privé spécifique à la session
    if (sessionConfig.mode === "private" && !isOwner && !isSudo) {
      return devask.sendMessage(chatId, {
        text: "*🚫 Le bot est en mode privé.*\n_Seule l'owner et les sudo peuvent utiliser les commandes._"
      }, { quoted: rawMsg });
    }
    
    const cmd = commands.get(command);

    // Vérifs automatiques via flags dans la commande
    if (cmd.ownerOnly && !isOwner) {
      return devask.sendMessage(chatId, { text: "🚫 Commande réservée au propriétaire." }, { quoted: rawMsg });
    }
    if (cmd.sudoOnly && !isSudo && !isOwner) {
      return devask.sendMessage(chatId, { text: "🚫 Commande réservée aux sudo/owner." }, { quoted: rawMsg });
    }
    if (cmd.groupOnly && !isGroup) {
      return devask.sendMessage(chatId, { text: "❌ Cette commande doit être utilisée dans un groupe." }, { quoted: rawMsg });
    }
    if (cmd.adminOnly && !isAdmins) {
      return devask.sendMessage(chatId, { text: "⛔ Seuls les admins peuvent utiliser cette commande." }, { quoted: rawMsg });
    }
    if (cmd.botAdminOnly && !isBotAdmins) {
      return devask.sendMessage(chatId, { text: "⚠️ Je dois être admin pour exécuter cette commande." }, { quoted: rawMsg });
    }

    // Exécution de la commande
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
      sender: userId
    });

  } catch (err) {
    console.error("❌ Erreur Handler:", err);
    try {
      await devask.sendMessage(m.chat, { text: "⚠️ Une erreur est survenue." }, { quoted: m });
    } catch {}
  }
}

export default handler;