// ==================== commands/session.js ====================
import sessionManager from "../system/sessionManager.js";

export default {
  name: "session",
  description: "Gérer les paramètres de votre session (préfixe, mode)",
  ownerOnly: false,
  sudoOnly: false,
  groupOnly: false,
  adminOnly: false,
  botAdminOnly: false,

  async run(devask, m, msg, args, context) {
    const { sender, sessionId, session, isSessionOwner, isSessionSudo } = context;
    const senderNumber = sender.split('@')[0];

    // Vérifier si l'utilisateur a une session
    if (!session) {
      return devask.sendMessage(m.chat, {
        text: "❌ Vous n'avez pas de session configurée.\n\n_Contactez l'administrateur pour configurer votre session._"
      }, { quoted: m });
    }

    // Seuls owner et sudo peuvent modifier
    if (!isSessionOwner && !isSessionSudo) {
      return devask.sendMessage(m.chat, {
        text: "🚫 Seuls l'owner et les sudo de cette session peuvent la modifier."
      }, { quoted: m });
    }

    const subCommand = args[0]?.toLowerCase();

    // Afficher les infos de la session
    if (!subCommand || subCommand === "info") {
      const sudoList = session.sudo?.join(", ") || "Aucun";
      return devask.sendMessage(m.chat, {
        text: `*📱 Informations de session*\n\n` +
              `🏷️ Nom: ${session.name}\n` +
              `👤 Owner: ${session.ownerNumber}\n` +
              `⚙️ Préfixe: ${session.prefix}\n` +
              `🔒 Mode: ${session.mode}\n` +
              `👥 Sudo: ${sudoList}\n` +
              `🆔 Session ID: ${session.sessionId}\n\n` +
              `*Commandes disponibles:*\n` +
              `• ${session.prefix}session prefix <nouveau>\n` +
              `• ${session.prefix}session mode <public|private>\n` +
              `• ${session.prefix}session addsudo <numéro>\n` +
              `• ${session.prefix}session delsudo <numéro>`
      }, { quoted: m });
    }

    // Changer le préfixe
    if (subCommand === "prefix") {
      const newPrefix = args[1];
      if (!newPrefix) {
        return devask.sendMessage(m.chat, {
          text: `❌ Usage: ${session.prefix}session prefix <nouveau_préfixe>\n\nExemple: ${session.prefix}session prefix #`
        }, { quoted: m });
      }

      if (newPrefix.length > 3) {
        return devask.sendMessage(m.chat, {
          text: "❌ Le préfixe doit faire maximum 3 caractères."
        }, { quoted: m });
      }

      sessionManager.updatePrefix(sessionId, newPrefix);
      return devask.sendMessage(m.chat, {
        text: `✅ Préfixe mis à jour: *${newPrefix}*\n\n_Les commandes utilisent maintenant: ${newPrefix}commande_`
      }, { quoted: m });
    }

    // Changer le mode
    if (subCommand === "mode") {
      const newMode = args[1]?.toLowerCase();
      if (!newMode || !["public", "private"].includes(newMode)) {
        return devask.sendMessage(m.chat, {
          text: `❌ Usage: ${session.prefix}session mode <public|private>\n\n` +
                `• *public*: Tout le monde peut utiliser le bot\n` +
                `• *private*: Seuls owner et sudo peuvent utiliser le bot`
        }, { quoted: m });
      }

      sessionManager.updateMode(sessionId, newMode);
      return devask.sendMessage(m.chat, {
        text: `✅ Mode mis à jour: *${newMode}*\n\n` +
              (newMode === "private" 
                ? "_Seuls l'owner et les sudo peuvent maintenant utiliser le bot._"
                : "_Tout le monde peut maintenant utiliser le bot._")
      }, { quoted: m });
    }

    // Ajouter un sudo
    if (subCommand === "addsudo") {
      if (!isSessionOwner) {
        return devask.sendMessage(m.chat, {
          text: "🚫 Seul l'owner peut ajouter des sudo."
        }, { quoted: m });
      }

      let sudoNumber = args[1];
      if (!sudoNumber) {
        // Vérifier si message cité
        if (m.quoted) {
          sudoNumber = m.quoted.sender.split('@')[0];
        } else {
          return devask.sendMessage(m.chat, {
            text: `❌ Usage: ${session.prefix}session addsudo <numéro>\n\nOu répondez à un message.`
          }, { quoted: m });
        }
      }

      // Nettoyer le numéro
      sudoNumber = sudoNumber.replace(/[^\d]/g, '');
      
      if (sessionManager.cleanNumber(session.ownerNumber) === sudoNumber) {
        return devask.sendMessage(m.chat, {
          text: "❌ L'owner est déjà admin de sa session."
        }, { quoted: m });
      }

      sessionManager.addSudo(sessionId, sudoNumber);
      return devask.sendMessage(m.chat, {
        text: `✅ *${sudoNumber}* ajouté aux sudo de cette session.`
      }, { quoted: m });
    }

    // Retirer un sudo
    if (subCommand === "delsudo") {
      if (!isSessionOwner) {
        return devask.sendMessage(m.chat, {
          text: "🚫 Seul l'owner peut retirer des sudo."
        }, { quoted: m });
      }

      let sudoNumber = args[1];
      if (!sudoNumber) {
        if (m.quoted) {
          sudoNumber = m.quoted.sender.split('@')[0];
        } else {
          return devask.sendMessage(m.chat, {
            text: `❌ Usage: ${session.prefix}session delsudo <numéro>\n\nOu répondez à un message.`
          }, { quoted: m });
        }
      }

      sudoNumber = sudoNumber.replace(/[^\d]/g, '');
      sessionManager.removeSudo(sessionId, sudoNumber);
      
      return devask.sendMessage(m.chat, {
        text: `✅ *${sudoNumber}* retiré des sudo de cette session.`
      }, { quoted: m });
    }

    // Commande inconnue
    return devask.sendMessage(m.chat, {
      text: `❌ Sous-commande inconnue: *${subCommand}*\n\n` +
            `Utilisez ${session.prefix}session info pour voir les commandes disponibles.`
    }, { quoted: m });
  }
};