// ==================== handler.js ====================
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import config, { getUserConfig } from "./config.js";
import decodeJid from "./system/decodeJid.js";
import checkAdminOrOwner from "./system/checkAdminOrOwner.js";

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

await loadCommands();

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
    const userId = decodeJid(m.sender);
    const chatId = decodeJid(m.chat);
    const isGroup = m.isGroup ?? chatId.endsWith("@g.us");

    // Récupération de la configuration SPÉCIFIQUE à l'utilisateur
    const userConfig = getUserConfig(userId);
    const userPrefix = userConfig.prefix || "!";
    const userMode = userConfig.mode || "public";

    console.log(`🔧 User: ${userId} | Prefix: "${userPrefix}" | Mode: "${userMode}"`);

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

    // Vérification du préfixe SPÉCIFIQUE à l'utilisateur
    if (!body.startsWith(userPrefix)) return;
    
    const args = body.slice(userPrefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const sender = m.sender || m.key.participant || m.key.remoteJid;

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
        if (!global.groupCache[chatId]) {
          metadata = await devask.groupMetadata(chatId);
          participants = metadata.participants || [];
          global.groupCache[chatId] = { metadata, participants };
        } else {
          metadata = global.groupCache[chatId].metadata;
          participants = global.groupCache[chatId].participants;
        }

        // Passe la userConfig à checkAdminOrOwner
        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, userConfig);
        isAdmins = perms.isAdmin;
        isOwner = perms.isOwner;
        isSudo = perms.isSudo;
        isAdminOrOwner = perms.isAdminOrOwner;

        const botPerms = await checkAdminOrOwner(devask, chatId, decodeJid(devask.user?.id), participants, metadata, userConfig);
        isBotAdmins = botPerms.isAdmin;
      } catch (e) {
        console.error("❌ Erreur metadata:", e);
      }
    } else {
      try {
        // Passe la userConfig à checkAdminOrOwner
        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata, userConfig);
        isOwner = perms.isOwner;
        isSudo = perms.isSudo;
        isAdminOrOwner = perms.isAdminOrOwner;
      } catch (e) {
        console.error("❌ Erreur permissions privé:", e);
      }
    }

    // Vérif si commande existe
    if (!commands.has(command)) {
      await devask.sendMessage(chatId, { react: { text: "❌", key: m.key } });

      await devask.sendMessage(chatId, {
        text: `❌ Commande *${command}* non reconnue.\n\n📌 Tapez *${userPrefix}menu* pour voir les options disponibles.`,
        contextInfo: {
          externalAdReply: {
            title: userConfig.name || "ASK CRASHER 🚫",
            body: "WHATSAPP BUG BOT",
            thumbnailUrl: "https://files.catbox.moe/zq1kuc.jpg",
            sourceUrl: "https://whatsapp.com/channel/0029VaiPkRPLY6d0qEX50e2k"
          }
        }
      }, { quoted: m });

      return;
    }

    // Vérif mode privé SPÉCIFIQUE à l'utilisateur
    if (userMode === "private" && !isOwner && !isSudo) {
      return devask.sendMessage(chatId, {
        text: `*🚫 Le bot ${userConfig.name || ''} est en mode privé.*\n_Seule l'owner et les sudo peuvent utiliser les commandes._`
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

    // Exécution de la commande avec la userConfig
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
      userConfig, // Passe la config utilisateur aux commandes
      prefix: userPrefix // Préfixe spécifique
    });

  } catch (err) {
    console.error("❌ Erreur Handler:", err);
    try {
      await devask.sendMessage(m.chat, { text: "⚠️ Une erreur est survenue." }, { quoted: m });
    } catch {}
  }
}

export default handler;