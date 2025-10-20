// ==================== index.js ====================
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import pino from 'pino';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Import Handler and smsg
import handler from "./handler.js";
import { smsg } from './system/func.js';

// <-- Whatsapp import module Baileys -->
import { makeWASocket, jidDecode, useMultiFileAuthState } from '@whiskeysockets/baileys';

// ==================== ESM __dirname ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== Globals ====================
global.groupSettings = {};
global.menuState = {};
global.groupCache = {};
if (!globalThis.crypto?.subtle) globalThis.crypto = crypto.webcrypto;

// ==================== MegaJS ====================
let File;
try {
  const megajs = await import('megajs');
  File = megajs?.default?.File || megajs.File;
} catch {
  console.log('📦 Installation de megajs...');
  execSync('npm install megajs', { stdio: 'inherit' });
  const megajs = await import('megajs');
  File = megajs?.default?.File || megajs.File;
}

// ==================== Sessions Directory ====================
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

// ==================== Config File Path ====================
const configPath = path.join(__dirname, 'config.json');

// ==================== Stockage des sessions actives ====================
const activeSessions = new Map();

// ==================== Charger la configuration ====================
function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      console.log("❌ Fichier config.json non trouvé");
      return { BOT_NAME: 'DEV ASK', sessions: [] };
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData;
  } catch (error) {
    console.error('❌ Erreur lors du chargement de config.json:', error);
    return { BOT_NAME: 'DEV ASK', sessions: [] };
  }
}

// ==================== Sauvegarder la configuration ====================
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    return false;
  }
}

// ==================== Supprimer une session de la config ====================
function removeSessionFromConfig(sessionName) {
  try {
    const config = loadConfig();
    config.sessions = config.sessions.filter(s => s.name !== sessionName);
    return saveConfig(config);
  } catch (error) {
    console.error('❌ Erreur suppression session:', error);
    return false;
  }
}

// ==================== Obtenir les noms des sessions actives ====================
function getActiveSessionNames() {
  return Array.from(activeSessions.keys());
}

// ==================== Détecter les nouvelles sessions ====================
function detectNewSessions(currentSessions) {
  const activeNames = getActiveSessionNames();
  const currentNames = currentSessions.map(s => s.name);
  
  const newSessions = currentSessions.filter(s => !activeNames.includes(s.name));
  const removedSessions = activeNames.filter(name => !currentNames.includes(name));
  
  return { newSessions, removedSessions };
}

// ==================== Arrêter et nettoyer une session ====================
function stopSession(sessionName) {
  const session = activeSessions.get(sessionName);
  if (session) {
    console.log(chalk.yellow(`🛑 Arrêt de la session: ${sessionName}`));
    // Fermer la connexion WhatsApp
    if (session.socket) {
      try {
        session.socket.end();
      } catch (e) {
        console.error('Erreur fermeture socket:', e);
      }
    }
    activeSessions.delete(sessionName);
  }
}

// ==================== Nettoyer une session déconnectée ====================
function cleanupDisconnectedSession(sessionName) {
  console.log(chalk.red(`🧹 Nettoyage session déconnectée: ${sessionName}`));
  
  // Supprimer de la config
  removeSessionFromConfig(sessionName);
  
  // Arrêter la session
  stopSession(sessionName);
  
  // Supprimer le dossier de session
  const sessionUserDir = path.join(sessionsDir, sessionName);
  try {
    if (fs.existsSync(sessionUserDir)) {
      fs.rmSync(sessionUserDir, { recursive: true, force: true });
      console.log(chalk.green(`✅ Dossier session supprimé: ${sessionName}`));
    }
  } catch (error) {
    console.error('❌ Erreur suppression dossier:', error);
  }
}

// ==================== Vérifier les sessions déconnectées > 5min ====================
function checkDisconnectedSessions() {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  
  activeSessions.forEach((session, sessionName) => {
    if (session.lastDisconnectTime && !session.connected) {
      const timeDisconnected = now - session.lastDisconnectTime;
      if (timeDisconnected > FIVE_MINUTES) {
        console.log(chalk.red(`⏰ Session ${sessionName} déconnectée depuis ${Math.round(timeDisconnected/1000)}s > 5min`));
        cleanupDisconnectedSession(sessionName);
      }
    }
  });
}

// ==================== Surveiller les changements de config.json ====================
function watchConfigChanges() {
  let lastConfig = JSON.stringify(loadConfig().sessions);
  
  fs.watchFile(configPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      try {
        const currentConfig = loadConfig();
        const currentSessions = currentConfig.sessions || [];
        const currentSessionsStr = JSON.stringify(currentSessions);
        
        if (currentSessionsStr !== lastConfig) {
          console.log('🔄 Détection de changement dans config.json...');
          const { newSessions, removedSessions } = detectNewSessions(currentSessions);
          
          // Arrêter les sessions supprimées
          removedSessions.forEach(sessionName => {
            stopSession(sessionName);
          });
          
          // Démarrer les nouvelles sessions
          if (newSessions.length > 0) {
            console.log(chalk.blue(`🎯 ${newSessions.length} nouvelle(s) session(s) à démarrer:`));
            newSessions.forEach(session => {
              console.log(chalk.blue(`   ➕ ${session.name}`));
            });
            startSessions(newSessions);
          } else if (removedSessions.length > 0) {
            console.log(chalk.yellow(`🗑️ ${removedSessions.length} session(s) supprimée(s)`));
          } else {
            console.log('✅ Aucun changement de session détecté');
          }
          
          lastConfig = currentSessionsStr;
        }
      } catch (error) {
        console.error('❌ Erreur lors du traitement des changements:', error);
      }
    }
  });
}

// ==================== Charger session Mega pour un utilisateur ====================
async function loadSessionFromMega(sessionId, sessionName) {
  try {
    const sessionUserDir = path.join(sessionsDir, sessionName);
    const credsPath = path.join(sessionUserDir, 'creds.json');
    
    if (fs.existsSync(credsPath)) {
      console.log(`✅ Session locale déjà présente pour ${sessionName}`);
      return true;
    }
    
    if (!sessionId.startsWith('ASK-CRASHER-V1~')) return false;

    const [fileID, key] = sessionId.replace('ASK-CRASHER-V1~', '').split('#');
    if (!fileID || !key) throw new Error('❌ SESSION_ID invalide');

    console.log(`🔄 Tentative de téléchargement Mega pour ${sessionName}: fileID=${fileID}, key=${key}`);
    const file = File.fromURL(`https://mega.nz/file/${fileID}#${key}`);
    await file.loadAttributes();

    const data = await new Promise((resolve, reject) =>
      file.download((err, d) => (err ? reject(err) : resolve(d)))
    );

    if (!fs.existsSync(sessionUserDir)) {
      fs.mkdirSync(sessionUserDir, { recursive: true });
    }
    
    await fs.promises.writeFile(credsPath, data);
    console.log(`✅ Session téléchargée et sauvegardée localement pour ${sessionName}`);
    return true;
  } catch (err) {
    console.warn(`⚠ Impossible de charger la session depuis Mega pour ${sessionName}:`, err);
    return false;
  }
}

// ==================== Lancer un bot pour une session ====================
async function startBotForSession(sessionConfig) {
  try {
    const { name: sessionName, sessionId, ownerNumber, sudo, prefix, mode } = sessionConfig;
    
    // Vérifier si la session est déjà active
    if (activeSessions.has(sessionName)) {
      console.log(chalk.yellow(`⚠ Session ${sessionName} déjà active, ignore...`));
      return;
    }

    const sessionUserDir = path.join(sessionsDir, sessionName);
    
    // Charger la session depuis Mega si nécessaire
    await loadSessionFromMega(sessionId, sessionName);

    const { state, saveCreds } = await useMultiFileAuthState(sessionUserDir);
    const devask = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: [`DevAsk Bot - ${sessionName}`, 'Safari', '3.3'],
      printQRInTerminal: false
    });

    // ==================== Stocker le nom de session pour le handler ====================
    devask.sessionName = sessionName;

    // ==================== Configuration globale par session ====================
    const config = loadConfig();
    global.PREFIX = prefix || '.';
    global.owner = [ownerNumber];
    global.SUDO = sudo || [];

    devask.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {};
        return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid;
      }
      return jid;
    };

    // Métriques de performance
    const performanceMetrics = {
      startTime: Date.now(),
      messageCount: 0,
      lastActivity: Date.now(),
      connectionTime: null
    };

    // ==================== Connexion ====================
    devask.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log(chalk.yellow(`📷 QR Code reçu pour ${sessionName}`));
        // Stocker le QR code pour l'interface
        activeSessions.set(sessionName, {
          socket: devask,
          config: sessionConfig,
          connected: false,
          qrCode: qr,
          lastDisconnectTime: null,
          performance: performanceMetrics
        });
      }
      
      if (connection === 'open') {
        performanceMetrics.connectionTime = Date.now();
        const connectionDuration = performanceMetrics.connectionTime - performanceMetrics.startTime;
        
        console.log(chalk.green(`✅ DevAsk connecté pour ${sessionName} en ${connectionDuration}ms !`));
        console.log(chalk.blue(`👤 Owner: ${ownerNumber}`));
        console.log(chalk.blue(`🔧 SUDO: ${global.SUDO.join(', ')}`));
        console.log(chalk.blue(`⚙️ Prefix: ${prefix || '.'}`));
        console.log(chalk.blue(`🌐 Mode: ${mode || 'public'}`));

        // Mettre à jour la session active
        activeSessions.set(sessionName, {
          socket: devask,
          config: sessionConfig,
          connected: true,
          qrCode: null,
          lastDisconnectTime: null,
          performance: {
            ...performanceMetrics,
            connectionTime: Date.now(),
            uptime: 0
          }
        });

        // Message de confirmation
        const message = `🤖 DevAsk Bot actif avec succès !\n👤 Owner: ${ownerNumber}\n⚙️ Prefix: ${prefix || '.'}\n🌐 Mode: ${mode || 'public'}\n⏱️ Connecté en ${connectionDuration}ms`;
        try { 
          await devask.sendMessage(devask.user.id, { text: message }); 
        } catch (err) { 
          console.error(err); 
        }
      } else if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error || 'unknown';
        const disconnectTime = Date.now();
        console.log(chalk.red(`❌ Déconnecté pour ${sessionName}:`), reason);
        
        // Mettre à jour les métriques
        activeSessions.set(sessionName, {
          socket: devask,
          config: sessionConfig,
          connected: false,
          qrCode: null,
          lastDisconnectTime: disconnectTime,
          performance: performanceMetrics
        });
        
        console.log(chalk.yellow(`⏳ Redémarrage de DevAsk pour ${sessionName} dans 5s...`));
        setTimeout(() => startBotForSession(sessionConfig), 5000);
      }
    });

    // ==================== Messages ====================
    devask.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      // Mettre à jour les métriques de performance
      performanceMetrics.messageCount++;
      performanceMetrics.lastActivity = Date.now();
      
      for (const msg of messages) {
        if (!msg?.message) continue;
        const m = smsg(devask, msg);
        try { 
          await handler(devask, m, msg, undefined); 
        } catch (err) { 
          console.error(`❌ Erreur message DevAsk pour ${sessionName}:`, err); 
        }
      }
    });

    devask.ev.on('creds.update', saveCreds);
    
    // Stocker la socket dans les sessions actives
    activeSessions.set(sessionName, {
      socket: devask,
      config: sessionConfig,
      connected: false,
      qrCode: null,
      lastDisconnectTime: null,
      performance: performanceMetrics
    });
    
    return devask;
  } catch (err) {
    console.error(`❌ Erreur pour la session ${sessionConfig.name}:`, err);
    // Retirer la session en erreur
    activeSessions.delete(sessionConfig.name);
  }
}

// ==================== Lancer des sessions spécifiques ====================
async function startSessions(sessions) {
  for (const session of sessions) {
    if (session.name && session.sessionId && session.ownerNumber) {
      console.log(chalk.blue(`🔧 Démarrage de la session: ${session.name}`));
      console.log(chalk.blue(`👤 Owner: ${session.ownerNumber}`));
      await startBotForSession(session);
    } else {
      console.log(`❌ Session invalide:`, session);
    }
  }
}

// ==================== Lancer toutes les sessions au démarrage ====================
async function startAllSessions() {
  const config = loadConfig();
  const sessions = config.sessions || [];
  console.log(`🚀 Démarrage de ${sessions.length} sessions...`);
  
  await startSessions(sessions);
  
  // Démarrer le monitoring des déconnexions
  setInterval(checkDisconnectedSessions, 30000); // Vérifier toutes les 30s
  
  // Afficher le statut
  console.log(chalk.green(`\n📊 Statut des sessions:`));
  console.log(chalk.green(`   ✅ ${activeSessions.size} session(s) en cours d'initialisation`));
  console.log(chalk.blue(`   🧹 Nettoyage auto des sessions déconnectées > 5min`));
  console.log(chalk.blue(`   🌐 Surveillance active des nouvelles sessions...\n`));
}

// ==================== Gestion propre de l'arrêt ====================
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Arrêt du bot en cours...'));
  // Arrêter toutes les sessions
  activeSessions.forEach((session, name) => {
    if (session.socket) {
      session.socket.end();
    }
  });
  process.exit(0);
});

// ==================== Export pour le serveur web ====================
export { activeSessions, loadConfig, removeSessionFromConfig };

// ==================== Execute ====================
console.log('🤖 Démarrage du système multi-sessions DevAsk...');
console.log('🎯 Mode: Déploiement incrémental avec nettoyage auto');
watchConfigChanges();
startAllSessions();