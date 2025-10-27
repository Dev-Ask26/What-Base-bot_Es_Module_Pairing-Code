// ==================== commands/sudo.js ====================

async function sudo(devask, m, msg, args, extra) {
  const { 
    isOwner, 
    userPrefix, 
    userId, 
    userSudoList,
    loadUserConfig, 
    saveUserConfig 
  } = extra;
  
  if (!isOwner) {
    return devask.sendMessage(m.chat, { 
      text: "❌ Seul l'owner peut gérer ses sudo." 
    }, { quoted: m });
  }
  
  if (!args[0]) {
    const sudoCount = userSudoList.length;
    
    return devask.sendMessage(m.chat, { 
      text: `⚡ **GESTION DE VOS SUDO**

👤 Vos sudo: *${sudoCount} utilisateur(s)*
💡 Usage: *${userPrefix}sudo [add/remove/list] [indicatif][num]*

Exemples:
• ${userPrefix}sudo add 34612345678  (Espagne)
• ${userPrefix}sudo remove 33123456789  
• ${userPrefix}sudo list

📝 Format: [indicatif pays][numéro sans 0]
❌ Interdit: numéros commençant par 0` 
    }, { quoted: m });
  }
  
  const sudoData = loadUserConfig("sudo.json");
  const mySudoList = sudoData[userId] || [];
  
  switch (args[0].toLowerCase()) {
    case "add":
      if (!args[1]) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Donne un numéro à ajouter.\nExemple: 33123456789 (France)" 
        }, { quoted: m });
      }
      
      // Formater et valider le numéro
      let numToAdd = args[1].replace(/[^\d]/g, '');
      
      // Vérifier que le numéro ne commence pas par 0
      if (numToAdd.startsWith('0')) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Le numéro ne doit pas commencer par 0.\nUtilisez l'indicatif pays sans 0.\nExemple: 33123456789 au lieu de 0123456789" 
        }, { quoted: m });
      }
      
      // Vérifier la longueur minimale (indicatif + numéro)
      if (numToAdd.length < 8) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Numéro trop court. Format: [indicatif pays][numéro]\nExemple: 33123456789 (France)" 
        }, { quoted: m });
      }
      
      // Vérifier l'indicatif pays (doit être entre 1 et 3 chiffres)
      const countryCodeMatch = numToAdd.match(/^(\d{1,3})/);
      if (!countryCodeMatch) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Format invalide. Utilisez: [indicatif pays][numéro]\nExemple: 33123456789 (France)" 
        }, { quoted: m });
      }
      
      const countryCode = countryCodeMatch[1];
      const jidToAdd = numToAdd + '@s.whatsapp.net';
      
      if (!mySudoList.includes(jidToAdd)) {
        mySudoList.push(jidToAdd);
        sudoData[userId] = mySudoList;
        
        if (saveUserConfig("sudo.json", sudoData)) {
          await devask.sendMessage(m.chat, { 
            text: `✅ **SUDO AJOUTÉ**

🌍 Pays: *+${countryCode}*
📞 Numéro: *${numToAdd}*
👤 JID: ${jidToAdd}
📊 Total: *${mySudoList.length} sudo*

_Cet utilisateur peut maintenant utiliser vos commandes en mode privé._` 
          }, { quoted: m });
        }
      } else {
        await devask.sendMessage(m.chat, { 
          text: `ℹ️ *${numToAdd}* est déjà dans VOS sudo.` 
        }, { quoted: m });
      }
      break;
      
    case "remove":
    case "del":
      if (!args[1]) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Donne un numéro à retirer.\nExemple: 33123456789" 
        }, { quoted: m });
      }
      
      // Formater le numéro
      let numToRemove = args[1].replace(/[^\d]/g, '');
      
      // Vérifier que le numéro ne commence pas par 0
      if (numToRemove.startsWith('0')) {
        return devask.sendMessage(m.chat, { 
          text: "❌ Le numéro ne doit pas commencer par 0.\nUtilisez l'indicatif pays sans 0.\nExemple: 33123456789 au lieu de 0123456789" 
        }, { quoted: m });
      }
      
      const jidToRemove = numToRemove + '@s.whatsapp.net';
      
      if (mySudoList.includes(jidToRemove)) {
        sudoData[userId] = mySudoList.filter((n) => n !== jidToRemove);
        
        if (saveUserConfig("sudo.json", sudoData)) {
          await devask.sendMessage(m.chat, { 
            text: `🗑️ **SUDO RETIRÉ**

📞 Numéro: *${numToRemove}*
👤 JID: ${jidToRemove}
📊 Total: *${sudoData[userId].length} sudo*

_Cet utilisateur ne peut plus utiliser vos commandes en mode privé._` 
          }, { quoted: m });
        }
      } else {
        await devask.sendMessage(m.chat, { 
          text: `ℹ️ *${numToRemove}* n'est pas dans VOTRE liste sudo.` 
        }, { quoted: m });
      }
      break;
      
    case "list":
      if (mySudoList.length > 0) {
        // Organiser par indicatif pays
        const sudoByCountry = {};
        mySudoList.forEach(jid => {
          const number = jid.split('@')[0];
          const countryCode = number.match(/^(\d{1,3})/)[1];
          if (!sudoByCountry[countryCode]) {
            sudoByCountry[countryCode] = [];
          }
          sudoByCountry[countryCode].push(number);
        });
        
        let listText = `📋 **VOS SUDO** (*${mySudoList.length}*)\n\n`;
        
        Object.keys(sudoByCountry).sort().forEach(countryCode => {
          listText += `🌍 **+${countryCode}** (${sudoByCountry[countryCode].length}):\n`;
          sudoByCountry[countryCode].forEach((number, index) => {
            listText += `  ${index + 1}. ${number}\n`;
          });
          listText += '\n';
        });
        
        listText += `💡 Utilisez *${userPrefix}sudo remove [num]* pour retirer un sudo.`;
        
        await devask.sendMessage(m.chat, { text: listText }, { quoted: m });
      } else {
        await devask.sendMessage(m.chat, { 
          text: `📋 **VOS SUDO**

Vous n'avez aucun sudo configuré.

💡 Utilisez *${userPrefix}sudo add [indicatif][num]* pour ajouter un sudo.
Exemple: *${userPrefix}sudo add 33123456789*` 
        }, { quoted: m });
      }
      break;
      
    default:
      await devask.sendMessage(m.chat, { 
        text: `❌ Commande invalide.

💡 Usage: *${userPrefix}sudo [add/remove/list] [indicatif][num]*

Exemples:
• ${userPrefix}sudo add 491234567890 (Allemagne)
• ${userPrefix}sudo remove 33123456789
• ${userPrefix}sudo list

📝 Format: [indicatif pays][numéro sans 0]
❌ Interdit: numéros commençant par 0` 
      }, { quoted: m });
      break;
  }
}

export default { name: "sudo", run: sudo };