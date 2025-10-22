// ==================== handler.js (Multi-session) ====================
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import decodeJid from "./system/decodeJid.js";
import checkAdminOrOwner from "./system/checkAdminOrOwner.js";
import sessionManager from "./system/sessionManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commands = new Map();
global.groupCache = {};

const commandsDir = path.join(__dirname, "commands");

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

    // ✨ NOUVEAU: Récupérer la session de l'utilisateur actuel
    const senderNumber = userId.split('@')[0];
    const currentSession = sessionManager.getSessionBySender(senderNumber);
    
    // ✨ STRICT: Si aucune session, ignorer le message
    if (!currentSession) {
      console.log(`⚠️ Utilisateur ${senderNumber} sans session configurée - ignoré`);
      return; // Ne répond pas si pas de session
    }
    
    const sessionPrefix = currentSession.prefix;
    const sessionMode = currentSession.mode;
    const sessionId = currentSession.sessionId;

    console.log(`📱 Session active: ${currentSession.name} | Préfixe: ${sessionPrefix} | Mode: ${sessionMode}`);

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

    // ✨ MODIFIÉ: Utiliser le préfixe de la session
    if (!body.startsWith(sessionPrefix)) return;
    
    const args = body.slice(sessionPrefix.length).trim().split(/ +/g);
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

    // ✨ NOUVEAU: Vérifier les permissions de la session
    const isSessionOwner = currentSession && sessionManager.isSessionOwner(senderNumber, sessionId);
    const isSessionSudo = currentSession && sessionManager.isSessionSudo(senderNumber, sessionId);

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

        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata);
        isAdmins = perms.isAdmin;
        isOwner = perms.isOwner || isSessionOwner;
        isSudo = perms.isSudo || isSessionSudo;
        isAdminOrOwner = perms.isAdminOrOwner || isSessionOwner || isSessionSudo;

        const botPerms = await checkAdminOrOwner(devask, chatId, decodeJid(devask.user?.id), participants, metadata);
        isBotAdmins = botPerms.isAdmin;
      } catch (e) {
        console.error("❌ Erreur metadata:", e);
      }
    } else {
      try {
        const perms = await checkAdminOrOwner(devask, chatId, userId, participants, metadata);
        isOwner = perms.isOwner || isSessionOwner;
        isSudo = perms.isSudo || isSessionSudo;
        isAdminOrOwner = perms.isAdminOrOwner || isSessionOwner || isSessionSudo;
      } catch (e) {
        console.error("❌ Erreur permissions privé:", e);
      }
    }

    // Vérif si commande existe
    if (!commands.has(command)) {
      await devask.sendMessage(chatId, { react: { text: "❌", key: m.key } });

      await devask.sendMessage(chatId, {
        text: `❌ Commande *${command}* non reconnue.\n\n📌 Tapez *${sessionPrefix}menu* pour voir les options disponibles.`,
        contextInfo: {
          externalAdReply: {
            title: "ASK CRASHER 🚫",
            body: "WHATSAPP BUG BOT",
            thumbnailUrl: "https://files.catbox.moe/zq1kuc.jpg",
            sourceUrl: "https://whatsapp.com/channel/0029VaiPkRPLY6d0qEX50e2k"
          }
        }
      }, { quoted: m });

      return;
    }

    // ✨ MODIFIÉ: Vérif mode privé basée sur la session
    if (sessionMode === "private" && !isOwner && !isSudo) {
      return devask.sendMessage(chatId, {
        text: `*🚫 Ce bot est en mode privé.*\n_Seuls l'owner et les sudo de cette session peuvent utiliser les commandes._`
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

    // Exécution de la commande avec infos de session
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
      // ✨ NOUVEAU: Informations de session
      session: currentSession,
      sessionId,
      sessionPrefix,
      sessionMode,
      isSessionOwner,
      isSessionSudo
    });

  } catch (err) {
    console.error("❌ Erreur Handler:", err);
    try {
      await devask.sendMessage(m.chat, { text: "⚠️ Une erreur est survenue." }, { quoted: m });
    } catch {}
  }
}

export default handler;