// config.js
import { readFileSync } from 'fs';

const configData = JSON.parse(readFileSync('./config.json', 'utf8'));

// Configuration globale
const globalConfig = {
  BOT_NAME: configData.BOT_NAME,
  SESSION_PREFIX: "!", // Préfixe par défaut pour les nouvelles sessions
  MODE: "public", // Mode par défaut
  OWNER_NUMBER: "221701234567", // Owner principal
  SUDO: ["221701234567"],
  AUTO_READ_STATUS: true,
  AUTO_TYPING_STATUS: false,
  SAVE_CHATS: true,
  BOT_IMAGES: ["https://files.catbox.moe/zq1kuc.jpg"],
  BOT_INFO: "WHATSAPP BUG BOT"
};

// Map des sessions par numéro de propriétaire
const sessionsByOwner = new Map();
configData.sessions.forEach(session => {
  sessionsByOwner.set(session.ownerNumber, session);
});

// Fonction pour récupérer la config d'un utilisateur
function getUserConfig(userId) {
  const cleanNumber = (num) => {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  };
  
  const userNumber = cleanNumber(userId.split('@')[0]);
  
  // Cherche d'abord une session exacte
  if (sessionsByOwner.has(userNumber)) {
    return sessionsByOwner.get(userNumber);
  }
  
  // Fallback: cherche avec correspondance partielle
  for (const [ownerNumber, session] of sessionsByOwner.entries()) {
    if (userNumber.includes(ownerNumber) || ownerNumber.includes(userNumber)) {
      return session;
    }
  }
  
  // Retourne une config par défaut si aucune session trouvée
  return {
    name: "default",
    sessionId: "default",
    ownerNumber: userNumber,
    prefix: globalConfig.SESSION_PREFIX,
    mode: globalConfig.MODE,
    sudo: [userNumber]
  };
}

export { globalConfig, getUserConfig, sessionsByOwner };
export default globalConfig;