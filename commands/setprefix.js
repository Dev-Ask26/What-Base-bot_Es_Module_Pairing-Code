// ==================== commands/setprefix.js ====================

async function setprefix(devask, m, msg, args, extra) {
  const { 
    isOwner,
    userPrefix, 
    userId, 
    loadUserConfig, 
    saveUserConfig 
  } = extra;
  
  // Vérification que seul l'owner peut changer le préfixe
  if (!isOwner) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Seul l'owner peut modifier le préfixe." 
    }, { quoted: m });
  }
  
  if (!args[0]) {
    return devask.sendMessage(m.chat, { 
      text: `🔧 **VOTRE PRÉFIXE ACTUEL**

📌 Préfixe: *${userPrefix}*
💡 Usage: *${userPrefix}setprefix [nouveau_prefix]*

Exemples:
• ${userPrefix}setprefix !
• ${userPrefix}setprefix .
• ${userPrefix}setprefix #
• ${userPrefix}setprefix $

⚠️ Seul l'owner peut modifier cette configuration.` 
    }, { quoted: m });
  }
  
  const newPrefix = args[0];
  
  // Validation du préfixe
  if (newPrefix.length > 3) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Le préfixe ne peut pas dépasser 3 caractères." 
    }, { quoted: m });
  }
  
  if (newPrefix.length === 0) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Le préfixe ne peut pas être vide." 
    }, { quoted: m });
  }
  
  // Vérifier les caractères autorisés
  const allowedChars = /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?~`a-zA-Z0-9]+$/;
  if (!allowedChars.test(newPrefix)) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Le préfixe contient des caractères non autorisés.\nUtilisez uniquement des lettres, chiffres et symboles standards." 
    }, { quoted: m });
  }
  
  const prefixes = loadUserConfig("prefix.json");
  prefixes[userId] = newPrefix;
  
  if (saveUserConfig("prefix.json", prefixes)) {
    await devask.sendMessage(m.chat, { 
      text: `✅ **PRÉFIXE PERSONNEL MIS À JOUR**

🔧 Nouveau préfixe: *${newPrefix}*
📝 Utilisez maintenant: *${newPrefix}menu*

⚠️ Cette modification est réservée à l'owner.
_Ce changement n'affecte que votre session._` 
    }, { quoted: m });
  } else {
    await devask.sendMessage(m.chat, { 
      text: "❌ Erreur lors de la sauvegarde du préfixe." 
    }, { quoted: m });
  }
}

export default { name: "setprefix", run: setprefix };