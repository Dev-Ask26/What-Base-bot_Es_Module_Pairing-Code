// ==================== server.js ====================
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Import des fonctions depuis index.js
import { activeSessions, loadConfig, startBotForSession } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ==================== KEEP ALIVE SYSTEM ====================
function startKeepAlive() {
  console.log('🫀 Initialisation du système Keep-Alive...');
  
  // Ping interne toutes les 4 minutes
  const keepAliveInterval = setInterval(async () => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`🫀 Keep-alive heartbeat - ${timestamp}`);
      
      // Vérifier le statut des sessions
      const connectedSessions = Array.from(activeSessions.values()).filter(s => s.connected).length;
      console.log(`📊 Sessions connectées: ${connectedSessions}/${activeSessions.size}`);
      
    } catch (error) {
      console.log('❌ Keep-alive error:', error.message);
    }
  }, 4 * 60 * 1000); // 4 minutes

  // Auto-ping externe si on est sur Render
  if (process.env.RENDER) {
    setInterval(async () => {
      try {
        const appUrl = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com` || `http://localhost:${PORT}`;
        const response = await fetch(`${appUrl}/api/ping`);
        console.log(`🌐 External ping: ${response.status} - ${appUrl}`);
      } catch (error) {
        console.log('❌ External ping failed:', error.message);
      }
    }, 3 * 60 * 1000); // 3 minutes
  }

  return keepAliveInterval;
}

// ==================== Fonctions Helper ====================

function saveConfig(config) {
  try {
    const configPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    return false;
  }
}

// ==================== Routes ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'deploye.html'));
});

// ==================== API Routes ====================

// API pour récupérer la configuration ET le statut des sessions
app.get('/api/config', (req, res) => {
    try {
        const config = loadConfig();
        
        // Ajouter le statut des sessions actives
        const sessionsWithStatus = config.sessions.map(session => {
            const activeSession = activeSessions.get(session.name);
            return {
                ...session,
                status: activeSession ? (activeSession.connected ? 'connected' : 'connecting') : 'not_started',
                hasQr: activeSession && activeSession.qrCode ? true : false,
                lastActivity: activeSession?.performance?.lastActivity || null,
                connectionTime: activeSession?.performance?.connectionTime || null,
                welcomeMessageSent: activeSession?.performance?.welcomeMessageSent || false
            };
        });

        res.json({
            ...config,
            sessions: sessionsWithStatus,
            activeSessionsCount: activeSessions.size,
            totalSessions: config.sessions.length,
            serverUptime: process.uptime(),
            lastKeepAlive: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erreur lecture config:', error);
        res.status(500).json({ 
            error: 'Erreur de lecture de la configuration'
        });
    }
});

// API PING pour keep-alive
app.get('/api/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        activeSessions: activeSessions.size,
        connectedSessions: Array.from(activeSessions.values()).filter(s => s.connected).length,
        memory: process.memoryUsage(),
        environment: process.env.RENDER ? 'render' : 'local'
    });
});

// API de santé améliorée
app.get('/api/health', (req, res) => {
    try {
        const config = loadConfig();
        const activeSessionsArray = Array.from(activeSessions.values());
        
        const stats = {
            connected: activeSessionsArray.filter(s => s.connected).length,
            connecting: activeSessionsArray.filter(s => !s.connected && !s.qrCode).length,
            qrRequired: activeSessionsArray.filter(s => s.qrCode).length,
            messageSent: activeSessionsArray.filter(s => s.performance?.welcomeMessageSent).length,
            totalMessages: activeSessionsArray.reduce((sum, s) => sum + (s.performance?.messageCount || 0), 0)
        };

        res.json({
            status: 'OK',
            message: 'ASK CRASHER Server Running',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            keepAlive: 'active',
            sessions: {
                active: activeSessions.size,
                total: config.sessions.length,
                stats: stats
            },
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            environment: process.env.RENDER ? 'render' : 'local'
        });
    } catch (error) {
        console.error('❌ Erreur health check:', error);
        res.status(500).json({ 
            status: 'ERROR',
            error: 'Erreur lors du health check'
        });
    }
});

// API pour sauvegarder la configuration ET démarrer les sessions
app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;

        // Validation basique
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({ error: 'Configuration invalide' });
        }

        // S'assurer que sessions est un tableau
        if (!Array.isArray(newConfig.sessions)) {
            newConfig.sessions = [];
        }

        // Charger l'ancienne config pour comparer
        const oldConfig = loadConfig();
        const oldSessions = oldConfig.sessions || [];

        // Trouver les nouvelles sessions
        const newSessions = newConfig.sessions.filter(newSession => 
            !oldSessions.some(oldSession => oldSession.name === newSession.name)
        );

        // Sauvegarder la configuration
        const success = saveConfig(newConfig);

        if (success) {
            console.log('✅ Configuration ASK CRASHER sauvegardée');
            
            // DÉMARRER LES NOUVELLES SESSIONS
            let startedCount = 0;
            let failedCount = 0;
            
            if (newSessions.length > 0) {
                console.log(`🎯 Détection de ${newSessions.length} nouvelle(s) session(s) à démarrer:`);
                
                for (const session of newSessions) {
                    console.log(`   ➕ Démarrage de: ${session.name} (${session.ownerNumber})`);
                    try {
                        await startBotForSession(session);
                        startedCount++;
                        console.log(`   ✅ Session ${session.name} démarrée avec succès`);
                    } catch (error) {
                        console.error(`   ❌ Erreur démarrage session ${session.name}:`, error.message);
                        failedCount++;
                    }
                }
            }

            res.json({ 
                success: true, 
                message: 'Configuration sauvegardée avec succès!',
                sessionsCount: newConfig.sessions.length,
                newSessionsStarted: startedCount,
                newSessionsFailed: failedCount,
                activeSessions: Array.from(activeSessions.keys()),
                keepAlive: 'active'
            });
        } else {
            throw new Error('Échec de la sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur sauvegarde config:', error);
        res.status(500).json({ 
            error: 'Erreur lors du déploiement: ' + error.message
        });
    }
});

// ==================== API POUR LA SURVEILLANCE ====================

// API pour vérifier le statut d'une session
app.get('/api/session/:sessionName/status', (req, res) => {
    try {
        const { sessionName } = req.params;
        const session = activeSessions.get(sessionName);

        if (!session) {
            return res.json({
                exists: false,
                status: 'not_started',
                connected: false,
                hasQr: false,
                message: 'Session non démarrée ou non trouvée'
            });
        }

        res.json({
            exists: true,
            status: session.connected ? 'connected' : 'connecting',
            connected: session.connected,
            hasQr: !!session.qrCode,
            performance: session.performance,
            config: session.config,
            lastDisconnectTime: session.lastDisconnectTime,
            message: session.connected ? 
                '✅ Bot connecté et opérationnel' : 
                session.qrCode ? 
                    '📷 QR Code requis - Vérifiez la console' : 
                    '🔄 Connexion en cours...'
        });
    } catch (error) {
        console.error('❌ Erreur statut session:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la vérification du statut'
        });
    }
});

// API pour vérifier si MegaJS a réussi à charger la session
app.get('/api/session/:sessionName/mega-status', (req, res) => {
    try {
        const { sessionName } = req.params;
        const config = loadConfig();
        const sessionConfig = config.sessions.find(s => s.name === sessionName);

        if (!sessionConfig) {
            return res.status(404).json({ 
                error: 'Session non trouvée dans la configuration',
                sessionName,
                existsInConfig: false
            });
        }

        const sessionUserDir = path.join(__dirname, 'sessions', sessionName);
        const credsPath = path.join(sessionUserDir, 'creds.json');
        
        const megaLoaded = fs.existsSync(credsPath);
        const sessionDirExists = fs.existsSync(sessionUserDir);
        
        res.json({
            sessionName,
            existsInConfig: true,
            megaLoaded,
            hasLocalSession: megaLoaded,
            sessionDirExists,
            sessionPath: sessionUserDir,
            message: megaLoaded ? 
                '✅ Session Mega chargée avec succès' : 
                '🔄 Session Mega non encore chargée'
        });
    } catch (error) {
        console.error('❌ Erreur vérification Mega:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la vérification Mega'
        });
    }
});

// API pour surveiller la connexion complète
app.get('/api/session/:sessionName/connection-status', async (req, res) => {
    try {
        const { sessionName } = req.params;
        const session = activeSessions.get(sessionName);

        if (!session) {
            return res.json({
                status: 'not_started',
                connected: false,
                messageSent: false,
                progress: 'session_not_started',
                details: 'La session n\'a pas été démarrée par le système'
            });
        }

        // Vérifier si le message de bienvenue a été envoyé
        const messageSent = session.performance?.welcomeMessageSent || false;
        
        let progress = 'connecting';
        let message = '🔄 Connexion en cours...';

        if (session.connected) {
            if (messageSent) {
                progress = 'completed';
                message = '✅ Bot connecté et message envoyé!';
            } else {
                progress = 'connected_no_message';
                message = '✅ Bot connecté - Envoi du message en cours...';
            }
        } else if (session.qrCode) {
            progress = 'qr_required';
            message = '📷 QR Code requis - Scannez le code dans la console';
        }

        res.json({
            status: session.connected ? 'connected' : 'connecting',
            connected: session.connected,
            hasQr: !!session.qrCode,
            messageSent: messageSent,
            progress: progress,
            message: message,
            performance: session.performance,
            lastActivity: session.performance?.lastActivity,
            connectionTime: session.performance?.connectionTime
        });

    } catch (error) {
        console.error('❌ Erreur statut connexion:', error);
        res.status(500).json({ 
            error: 'Erreur lors de la vérification de la connexion'
        });
    }
});

// API pour voir les sessions actives avec détails
app.get('/api/sessions/active', (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([name, session]) => ({
            name,
            connected: session.connected,
            hasQr: !!session.qrCode,
            ownerNumber: session.config?.ownerNumber,
            performance: session.performance,
            lastDisconnectTime: session.lastDisconnectTime,
            config: session.config,
            status: session.connected ? 'connected' : 
                   session.qrCode ? 'qr_required' : 'connecting',
            welcomeMessageSent: session.performance?.welcomeMessageSent || false
        }));

        res.json({
            total: activeSessions.size,
            sessions: sessions,
            stats: {
                connected: sessions.filter(s => s.connected).length,
                connecting: sessions.filter(s => !s.connected && !s.hasQr).length,
                qrRequired: sessions.filter(s => s.hasQr).length,
                messageSent: sessions.filter(s => s.welcomeMessageSent).length
            },
            serverUptime: process.uptime(),
            lastUpdate: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erreur récupération sessions:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API pour forcer le démarrage d'une session spécifique
app.post('/api/sessions/start', async (req, res) => {
    try {
        const { sessionName } = req.body;
        
        if (!sessionName) {
            return res.status(400).json({ error: 'Nom de session requis' });
        }

        const config = loadConfig();
        const session = config.sessions.find(s => s.name === sessionName);
        
        if (!session) {
            return res.status(404).json({ error: 'Session non trouvée dans la config' });
        }

        // Vérifier si la session est déjà active
        if (activeSessions.has(sessionName)) {
            const activeSession = activeSessions.get(sessionName);
            return res.json({ 
                success: true, 
                message: 'Session déjà active',
                sessionName: sessionName,
                connected: activeSession.connected,
                status: activeSession.connected ? 'connected' : 'connecting'
            });
        }

        // Démarrer la session
        await startBotForSession(session);
        
        res.json({ 
            success: true, 
            message: 'Session démarrée avec succès',
            sessionName: sessionName,
            status: 'starting'
        });

    } catch (error) {
        console.error('❌ Erreur démarrage session:', error);
        res.status(500).json({ 
            error: 'Erreur lors du démarrage: ' + error.message
        });
    }
});

// API pour obtenir les logs d'une session spécifique
app.get('/api/session/:sessionName/logs', (req, res) => {
    try {
        const { sessionName } = req.params;
        const session = activeSessions.get(sessionName);

        if (!session) {
            return res.status(404).json({ 
                error: 'Session non trouvée ou non active',
                sessionName
            });
        }

        res.json({
            sessionName,
            performance: session.performance,
            config: session.config,
            connectionInfo: {
                connected: session.connected,
                hasQr: !!session.qrCode,
                lastDisconnectTime: session.lastDisconnectTime,
                welcomeMessageSent: session.performance?.welcomeMessageSent || false,
                uptime: session.connected && session.performance.connectionTime ? 
                    Date.now() - session.performance.connectionTime : 0
            }
        });
    } catch (error) {
        console.error('❌ Erreur récupération logs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API pour les statistiques globales
app.get('/api/stats', (req, res) => {
    try {
        const config = loadConfig();
        const activeSessionsArray = Array.from(activeSessions.values());
        
        const stats = {
            global: {
                totalSessions: config.sessions.length,
                activeSessions: activeSessions.size,
                uptime: process.uptime(),
                serverStartTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                keepAlive: 'active'
            },
            sessions: {
                connected: activeSessionsArray.filter(s => s.connected).length,
                connecting: activeSessionsArray.filter(s => !s.connected && !s.qrCode).length,
                qrRequired: activeSessionsArray.filter(s => s.qrCode).length,
                messageSent: activeSessionsArray.filter(s => s.performance?.welcomeMessageSent).length,
                disconnected: config.sessions.length - activeSessions.size
            },
            performance: {
                totalMessages: activeSessionsArray.reduce((sum, s) => sum + (s.performance?.messageCount || 0), 0),
                averageUptime: activeSessionsArray.filter(s => s.connected && s.performance.connectionTime)
                    .reduce((avg, s, i, arr) => {
                        const uptime = Date.now() - s.performance.connectionTime;
                        return (avg * i + uptime) / (i + 1);
                    }, 0)
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('❌ Erreur statistiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route 404 améliorée
app.use((req, res) => {
    res.status(404).json({
        error: 'Page non trouvée',
        message: 'Utilisez / pour déployer une session ASK CRASHER',
        availableEndpoints: [
            'GET  / - Page de déploiement',
            'GET  /api/config - Configuration',
            'GET  /api/ping - Keep-alive',
            'GET  /api/health - Santé du serveur',
            'POST /api/config - Sauvegarder configuration',
            'GET  /api/session/:name/status - Statut session',
            'GET  /api/session/:name/mega-status - Statut Mega',
            'GET  /api/session/:name/connection-status - Statut connexion complète',
            'GET  /api/sessions/active - Sessions actives',
            'GET  /api/stats - Statistiques'
        ]
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('❌ Erreur non gérée:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n🔥 ASK CRASHER Server Started!`);
    console.log(`=========================================`);
    console.log(`🚀 Déploiement: http://localhost:${PORT}`);
    console.log(`🔧 API Config: http://localhost:${PORT}/api/config`);
    console.log(`📊 Sessions: http://localhost:${PORT}/api/sessions/active`);
    console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
    console.log(`🫀 Keep-alive: http://localhost:${PORT}/api/ping`);
    console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    console.log(`=========================================\n`);
    
    // Démarrer le système keep-alive
    startKeepAlive();
});

export default app;