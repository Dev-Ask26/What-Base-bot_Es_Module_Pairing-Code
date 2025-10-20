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
      return { BOT_NAME: 'ASK CRASHER', sessions: [] };
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData;
  } catch (error) {
    console.error('❌ Erreur lors du chargement de config.json:', error);
    return { BOT_NAME: 'ASK CRASHER', sessions: [] };
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
    const initialLength = config.sessions.length;
    config.sessions = config.sessions.filter(s => s.name !== sessionName);
    
    if (config.sessions.length === initialLength) {
      console.log(chalk.yellow(`⚠️ Session ${sessionName} non trouvée dans la config`));
      return false;
    }
    
    const success = saveConfig(config);
    if (success) {
      console.log(chalk.green(`✅ Session ${sessionName} supprimée de la configuration`));
    }
    return success;
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
        console.log(chalk.green(`✅ Connexion WhatsApp fermée pour ${sessionName}`));
      } catch (e) {
        console.error('❌ Erreur fermeture socket:', e);
      }
    }
    activeSessions.delete(sessionName);
  }
}

// ==================== Nettoyer une session déconnectée ====================
function cleanupDisconnectedSession(sessionName) {
  console.log(chalk.red(`🧹 Nettoyage session déconnectée: ${sessionName}`));

  // Supprimer de la config
  const removed = removeSessionFromConfig(sessionName);

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

  return removed;
}

// ==================== Vérifier les sessions déconnectées > 5min ====================
function checkDisconnectedSessions() {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  let cleanedCount = 0;

  activeSessions.forEach((session, sessionName) => {
    if (session.lastDisconnectTime && !session.connected) {
      const timeDisconnected = now - session.lastDisconnectTime;
      if (timeDisconnected > FIVE_MINUTES) {
        console.log(chalk.red(`⏰ Session ${sessionName} déconnectée depuis ${Math.round(timeDisconnected/1000)}s > 5min`));
        if (cleanupDisconnectedSession(sessionName)) {
          cleanedCount++;
        }
      }
    }
  });

  if (cleanedCount > 0) {
    console.log(chalk.yellow(`🗑️ ${cleanedCount} session(s) nettoyée(s) automatiquement`));
  }
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
          console.log(chalk.blue('🔄 Détection de changement dans config.json...'));
          const { newSessions, removedSessions } = detectNewSessions(currentSessions);

          // Arrêter les sessions supprimées
          removedSessions.forEach(sessionName => {
            console.log(chalk.yellow(`🗑️ Arrêt de la session supprimée: ${sessionName}`));
            stopSession(sessionName);
          });

          // Démarrer les nouvelles sessions
          if (newSessions.length > 0) {
            console.log(chalk.blue(`🎯 ${newSessions.length} nouvelle(s) session(s) à démarrer:`));
            newSessions.forEach(session => {
              console.log(chalk.blue(`   ➕ ${session.name} (Owner: ${session.ownerNumber})`));
            });
            startSessions(newSessions);
          } else if (removedSessions.length > 0) {
            console.log(chalk.yellow(`📊 ${removedSessions.length} session(s) supprimée(s) de la config`));
          } else {
            console.log(chalk.green('✅ Aucun changement de session détecté'));
          }

          lastConfig = currentSessionsStr;
        }
      } catch (error) {
        console.error('❌ Erreur lors du traitement des changements:', error);
      }
    }
  });

  console.log(chalk.green('👀 Surveillance de config.json activée'));
}

// ==================== Charger session Mega pour un utilisateur ====================
async function loadSessionFromMega(sessionId, sessionName) {
  try {
    const sessionUserDir = path.join(sessionsDir, sessionName);
    const credsPath = path.join(sessionUserDir, 'creds.json');

    if (fs.existsSync(credsPath)) {
      console.log(chalk.green(`✅ Session locale déjà présente pour ${sessionName}`));
      return true;
    }

    if (!sessionId.startsWith('ASK-CRASHER-V1~')) {
      console.log(chalk.yellow(`⚠️ Format Session ID non reconnu pour ${sessionName}`));
      return false;
    }

    const [fileID, key] = sessionId.replace('ASK-CRASHER-V1~', '').split('#');
    if (!fileID || !key) {
      console.log(chalk.red(`❌ SESSION_ID invalide pour ${sessionName}`));
      return false;
    }

    console.log(chalk.blue(`🔄 Tentative de téléchargement Mega pour ${sessionName}`));
    console.log(chalk.blue(`   📁 FileID: ${fileID}`));
    
    const file = File.fromURL(`https://mega.nz/file/${fileID}#${key}`);
    await file.loadAttributes();

    const data = await new Promise((resolve, reject) =>
      file.download((err, d) => (err ? reject(err) : resolve(d)))
    );

    if (!fs.existsSync(sessionUserDir)) {
      fs.mkdirSync(sessionUserDir, { recursive: true });
    }

    await fs.promises.writeFile(credsPath, data);
    console.log(chalk.green(`✅ Session téléchargée et sauvegardée localement pour ${sessionName}`));
    return true;
  } catch (err) {
    console.error(chalk.red(`❌ Impossible de charger la session depuis Mega pour ${sessionName}:`), err.message);
    return false;
  }
}

// ==================== Envoyer un message de confirmation ====================
async function sendWelcomeMessage(devask, sessionConfig, connectionDuration) {
  try {
    const { ownerNumber, prefix, mode, name: sessionName } = sessionConfig;
    
    // Attendre que l'utilisateur soit disponible
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      if (devask.user && devask.user.id) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!devask.user || !devask.user.id) {
      console.log(chalk.yellow(`⚠️ User non disponible pour ${sessionName} après ${maxAttempts} tentatives`));
      return false;
    }
    
    const message = `🤖 *ASK CRASHER* activé avec succès !\n\n` +
                  `👤 *Owner:* ${ownerNumber}\n` +
                  `⚙️ *Prefix:* ${prefix || '.'}\n` +
                  `🌐 *Mode:* ${mode || 'public'}\n` +
                  `⏱️ *Connecté en:* ${connectionDuration}ms\n\n` +
                  `💡 Utilisez *${prefix || '.'}menu* pour voir les commandes disponibles.\n` +
                  `🔧 *Session:* ${sessionName}`;
    
    await devask.sendMessage(devask.user.id, { text: message });
    console.log(chalk.green(`✅ Message de confirmation envoyé pour ${sessionName}`));
    return true;
    
  } catch (err) {
    console.error(chalk.red(`❌ Erreur envoi message confirmation:`), err.message);
    return false;
  }
}

// ==================== Lancer un bot pour une session ====================
async function startBotForSession(sessionConfig) {
  try {
    const { name: sessionName, sessionId, ownerNumber, sudo, prefix, mode } = sessionConfig;

    // Vérifier si la session est déjà active
    if (activeSessions.has(sessionName)) {
      console.log(chalk.yellow(`⚠️ Session ${sessionName} déjà active, ignore...`));
      return;
    }

    console.log(chalk.blue(`🔧 Initialisation de la session: ${sessionName}`));
    console.log(chalk.blue(`   👤 Owner: ${ownerNumber}`));
    console.log(chalk.blue(`   ⚙️ Prefix: ${prefix || '.'}`));
    console.log(chalk.blue(`   🌐 Mode: ${mode || 'public'}`));

    const sessionUserDir = path.join(sessionsDir, sessionName);

    // Charger la session depuis Mega si nécessaire
    const megaLoaded = await loadSessionFromMega(sessionId, sessionName);
    if (!megaLoaded && !fs.existsSync(path.join(sessionUserDir, 'creds.json'))) {
      console.log(chalk.red(`❌ Impossible de charger la session pour ${sessionName}`));
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionUserDir);
    const devask = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: [`ASK CRASHER - ${sessionName}`, 'Safari', '3.3'],
      printQRInTerminal: true, // Activé pour le debug
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
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
      connectionTime: null,
      connectionAttempts: 0
    };

    // ==================== Gestionnaire de connexion ====================
    devask.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      if (qr) {
        console.log(chalk.yellow(`📷 QR Code reçu pour ${sessionName}`));
        performanceMetrics.connectionAttempts++;
        
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

        console.log(chalk.green(`🎉 ASK CRASHER CONNECTÉ pour ${sessionName}`));
        console.log(chalk.green(`   ⏱️ Temps de connexion: ${connectionDuration}ms`));
        console.log(chalk.blue(`   👤 Owner: ${ownerNumber}`));
        console.log(chalk.blue(`   🔧 SUDO: ${sudo?.join(', ') || 'Aucun'}`));
        console.log(chalk.blue(`   ⚙️ Prefix: ${prefix || '.'}`));
        console.log(chalk.blue(`   🌐 Mode: ${mode || 'public'}`));

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

        // Envoyer le message de bienvenue après un délai
        setTimeout(async () => {
          await sendWelcomeMessage(devask, sessionConfig, connectionDuration);
        }, 3000);

      } else if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message || 'unknown';
        const disconnectTime = Date.now();
        
        console.log(chalk.red(`🔴 DÉCONNEXION pour ${sessionName}`));
        console.log(chalk.red(`   📋 Raison: ${reason}`));

        // Mettre à jour les métriques
        activeSessions.set(sessionName, {
          socket: devask,
          config: sessionConfig,
          connected: false,
          qrCode: null,
          lastDisconnectTime: disconnectTime,
          performance: performanceMetrics
        });

        // Redémarrer après un délai (éviter les boucles rapides)
        const restartDelay = 10000; // 10 secondes
        console.log(chalk.yellow(`   ⏳ Redémarrage dans ${restartDelay/1000}s...`));
        
        setTimeout(() => {
          console.log(chalk.blue(`🔄 Tentative de reconnexion pour ${sessionName}`));
          startBotForSession(sessionConfig);
        }, restartDelay);
      } else if (connection === 'connecting') {
        console.log(chalk.blue(`🔄 Connexion en cours pour ${sessionName}...`));
      }
    });

    // ==================== Gestionnaire de messages ====================
    devask.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      // Mettre à jour les métriques de performance
      performanceMetrics.messageCount++;
      performanceMetrics.lastActivity = Date.now();

      for (const msg of messages) {
        if (!msg?.message) continue;
        try {
          const m = smsg(devask, msg);
          await handler(devask, m, msg, undefined);
        } catch (err) {
          console.error(chalk.red(`❌ Erreur traitement message pour ${sessionName}:`), err.message);
        }
      }
    });

    // ==================== Gestionnaire de crédits ====================
    devask.ev.on('creds.update', saveCreds);

    // ==================== Gestionnaire d'erreurs global ====================
    devask.ev.on('connection.update', (update) => {
      if (update.error) {
        console.error(chalk.red(`❌ Erreur connexion ${sessionName}:`), update.error);
      }
    });

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
    console.error(chalk.red(`❌ Erreur critique pour la session ${sessionConfig.name}:`), err);
    // Nettoyer en cas d'erreur
    activeSessions.delete(sessionConfig.name);
    
    // Retenter après un délai
    setTimeout(() => {
      console.log(chalk.yellow(`🔄 Nouvelle tentative pour ${sessionConfig.name} après erreur...`));
      startBotForSession(sessionConfig);
    }, 15000);
  }
}

// ==================== Lancer des sessions spécifiques ====================
async function startSessions(sessions) {
  const results = {
    success: 0,
    failed: 0
  };

  for (const session of sessions) {
    if (session.name && session.sessionId && session.ownerNumber) {
      try {
        await startBotForSession(session);
        results.success++;
      } catch (error) {
        console.error(chalk.red(`❌ Échec démarrage session ${session.name}:`), error.message);
        results.failed++;
      }
    } else {
      console.log(chalk.red(`❌ Session invalide: ${JSON.stringify(session)}`));
      results.failed++;
    }
  }

  console.log(chalk.blue(`📊 Résultat démarrage sessions: ${results.success} réussie(s), ${results.failed} échouée(s)`));
  return results;
}

// ==================== Lancer toutes les sessions au démarrage ====================
async function startAllSessions() {
  const config = loadConfig();
  const sessions = config.sessions || [];
  
  console.log(chalk.blue(`🚀 Démarrage de ${sessions.length} session(s)...`));
  
  if (sessions.length === 0) {
    console.log(chalk.yellow('💡 Aucune session à démarrer. Utilisez la page web pour déployer une session.'));
    return;
  }

  const results = await startSessions(sessions);

  // Démarrer le monitoring des déconnexions
  setInterval(checkDisconnectedSessions, 30000); // Vérifier toutes les 30s

  // Afficher le statut
  console.log(chalk.green('\n📊 SYSTÈME ASK CRASHER ACTIF'));
  console.log(chalk.green(`   ✅ ${results.success} session(s) démarrée(s)`));
  if (results.failed > 0) {
    console.log(chalk.red(`   ❌ ${results.failed} session(s) en échec`));
  }
  console.log(chalk.blue(`   🧹 Nettoyage auto des sessions déconnectées > 5min`));
  console.log(chalk.blue(`   🌐 Surveillance active des nouvelles sessions`));
  console.log(chalk.green(`   🎯 Système prêt à recevoir de nouvelles sessions\n`));
}

// ==================== Gestion propre de l'arrêt ====================
function gracefulShutdown() {
  console.log(chalk.yellow('\n🛑 Arrêt du système ASK CRASHER en cours...'));
  
  let stoppedCount = 0;
  const totalSessions = activeSessions.size;
  
  activeSessions.forEach((session, name) => {
    if (session.socket) {
      try {
        session.socket.end();
        stoppedCount++;
        console.log(chalk.green(`   ✅ Session ${name} arrêtée`));
      } catch (e) {
        console.error(chalk.red(`   ❌ Erreur arrêt session ${name}:`), e.message);
      }
    }
  });
  
  console.log(chalk.yellow(`📊 ${stoppedCount}/${totalSessions} session(s) arrêtée(s) proprement`));
  console.log(chalk.green('👋 Arrêt complet du système'));
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ==================== Export pour le serveur web ====================
export { activeSessions, loadConfig, removeSessionFromConfig };

// ==================== Execute ====================
console.log(chalk.magenta('\n🤖 ASK CRASHER - Système Multi-Sessions'));
console.log(chalk.magenta('========================================='));
console.log(chalk.blue('   🚀 Initialisation du système...'));
console.log(chalk.blue('   📁 Dossier sessions:', sessionsDir));
console.log(chalk.blue('   ⚙️  Fichier config:', configPath));
console.log(chalk.magenta('=========================================\n'));

// Démarrer le système
watchConfigChanges();
startAllSessions();