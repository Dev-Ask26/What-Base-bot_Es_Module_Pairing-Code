// config.js
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🔥 CHEMIN CORRIGÉ - va chercher config.json à la racine
const configPath = join(__dirname, '..', 'config.json');

let configData;
try {
  configData = JSON.parse(readFileSync(configPath, 'utf8'));
  console.log('✅ config.json chargé avec succès');
} catch (error) {
  console.error('❌ Erreur chargement config.json:', error);
  // Fallback pour éviter que le bot crash
  configData = {
    BOT_NAME: "ASK CRASHER",
    sessions: [
      {
        name: "default",
        sessionId: "default",
        ownerNumber: "221701234567",
        prefix: "!",
        mode: "public",
        sudo: ["221701234567"]
      }
    ]
  };
}

// Configuration globale
const globalConfig = {
  BOT_NAME: configData.BOT_NAME,
  SESSION_PREFIX: "!",
  MODE: "public",
  OWNER_NUMBER: "221701234567",
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
  console.log(`✅ Session chargée: ${session.name} -> ${session.ownerNumber}`);
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