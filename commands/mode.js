// ==================== commands/mode.js ====================

async function mode(devask, m, msg, args, extra) {
  const { 
    userPrefix, 
    userMode, 
    userId, 
    isOwner,
    isSudo,
    loadUserConfig, 
    saveUserConfig 
  } = extra;
  
  if (!args[0]) {
    const modeStatus = userMode === "private" ? "🔒 Privé" : "🌐 Public";
    
    return devask.sendMessage(m.chat, { 
      text: `🔧 **VOTRE MODE ACTUEL**

📱 Mode: *${modeStatus}*
👤 Owner: *${isOwner ? '✅' : '❌'}*
⚡ Sudo: *${isSudo ? '✅' : '❌'}*

💡 Usage: *${userPrefix}mode [public/private]*

🔒 Mode Privé: Seul l'owner et les sudo peuvent utiliser vos commandes
🌐 Mode Public: Tous les utilisateurs peuvent utiliser vos commandes

⚠️ Seul l'owner peut modifier cette configuration.` 
    }, { quoted: m });
  }
  
  // Vérification que seul l'owner peut changer le mode
  if (!isOwner) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Seul l'owner peut modifier le mode." 
    }, { quoted: m });
  }
  
  const newMode = args[0].toLowerCase();
  
  if (!["public", "private"].includes(newMode)) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Mode invalide. Utilisez: *public* ou *private*" 
    }, { quoted: m });
  }
  
  const modes = loadUserConfig("mode.json");
  modes[userId] = newMode;
  
  if (saveUserConfig("mode.json", modes)) {
    const modeText = newMode === "private" ? "🔒 Privé" : "🌐 Public";
    
    await devask.sendMessage(m.chat, { 
      text: `✅ **MODE PERSONNEL MIS À JOUR**

📱 Nouveau mode: *${modeText}*

${newMode === "private" 
  ? "🔒 Seul l'owner et les sudo peuvent utiliser vos commandes" 
  : "🌐 Tous les utilisateurs peuvent utiliser vos commandes"
}

⚠️ Cette modification est réservée à l'owner.` 
    }, { quoted: m });
  } else {
    await devask.sendMessage(m.chat, { 
      text: "❌ Erreur lors de la sauvegarde du mode." 
    }, { quoted: m });
  }
}

export default { name: "mode", run: mode };