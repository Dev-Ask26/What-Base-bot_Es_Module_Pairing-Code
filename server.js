// ==================== server.js ====================
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import des fonctions depuis index.js
import { activeSessions, loadConfig, startBotForSession } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

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
                connectionTime: activeSession?.performance?.connectionTime || null
            };
        });

        res.json({
            ...config,
            sessions: sessionsWithStatus,
            activeSessionsCount: activeSessions.size,
            totalSessions: config.sessions.length
        });
    } catch (error) {
        console.error('❌ Erreur lecture config:', error);
        res.status(500).json({ 
            error: 'Erreur de lecture de la configuration'
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
                activeSessions: Array.from(activeSessions.keys())
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

// ==================== NOUVELLES ROUTES POUR LA SURVEILLANCE ====================

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
                   session.qrCode ? 'qr_required' : 'connecting'
        }));

        res.json({
            total: activeSessions.size,
            sessions: sessions,
            stats: {
                connected: sessions.filter(s => s.connected).length,
                connecting: sessions.filter(s => !s.connected && !s.hasQr).length,
                qrRequired: sessions.filter(s => s.hasQr).length
            }
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

// API pour redémarrer toutes les sessions
app.post('/api/sessions/restart-all', async (req, res) => {
    try {
        const config = loadConfig();
        const sessions = config.sessions || [];
        
        console.log('🔄 Redémarrage de toutes les sessions...');
        
        let startedCount = 0;
        let failedCount = 0;
        
        for (const session of sessions) {
            try {
                // Arrêter la session existante si elle est active
                if (activeSessions.has(session.name)) {
                    const activeSession = activeSessions.get(session.name);
                    if (activeSession.socket) {
                        activeSession.socket.end();
                    }
                    activeSessions.delete(session.name);
                }
                
                // Redémarrer la session
                await startBotForSession(session);
                startedCount++;
                console.log(`✅ Session ${session.name} redémarrée`);
            } catch (error) {
                console.error(`❌ Erreur session ${session.name}:`, error.message);
                failedCount++;
            }
        }
        
        res.json({
            success: true,
            message: `${startedCount}/${sessions.length} sessions redémarrées`,
            sessionsStarted: startedCount,
            sessionsFailed: failedCount,
            totalSessions: sessions.length
        });
        
    } catch (error) {
        console.error('❌ Erreur redémarrage sessions:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
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
                uptime: session.connected && session.performance.connectionTime ? 
                    Date.now() - session.performance.connectionTime : 0
            }
        });
    } catch (error) {
        console.error('❌ Erreur récupération logs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API pour supprimer une session
app.delete('/api/session/:sessionName', (req, res) => {
    try {
        const { sessionName } = req.params;
        
        // Importer la fonction de suppression depuis index.js
        import('./index.js').then(({ removeSessionFromConfig }) => {
            const success = removeSessionFromConfig(sessionName);
            
            if (success) {
                res.json({
                    success: true,
                    message: `Session ${sessionName} supprimée avec succès`,
                    sessionName
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: `Session ${sessionName} non trouvée`
                });
            }
        }).catch(error => {
            console.error('❌ Erreur import suppression:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        });
    } catch (error) {
        console.error('❌ Erreur suppression session:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API de santé du serveur avec statistiques détaillées
app.get('/api/health', (req, res) => {
    try {
        const config = loadConfig();
        const activeSessionsArray = Array.from(activeSessions.values());
        
        const stats = {
            connected: activeSessionsArray.filter(s => s.connected).length,
            connecting: activeSessionsArray.filter(s => !s.connected && !s.qrCode).length,
            qrRequired: activeSessionsArray.filter(s => s.qrCode).length,
            totalMessages: activeSessionsArray.reduce((sum, s) => sum + (s.performance?.messageCount || 0), 0)
        };

        res.json({
            status: 'OK',
            message: 'ASK CRASHER Server Running',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            sessions: {
                active: activeSessions.size,
                total: config.sessions.length,
                stats: stats
            },
            memory: process.memoryUsage(),
            nodeVersion: process.version
        });
    } catch (error) {
        console.error('❌ Erreur health check:', error);
        res.status(500).json({ 
            status: 'ERROR',
            error: 'Erreur lors du health check'
        });
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
                serverStartTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
            },
            sessions: {
                connected: activeSessionsArray.filter(s => s.connected).length,
                connecting: activeSessionsArray.filter(s => !s.connected && !s.qrCode).length,
                qrRequired: activeSessionsArray.filter(s => s.qrCode).length,
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
            'POST /api/config - Sauvegarder configuration',
            'GET  /api/session/:name/status - Statut session',
            'GET  /api/session/:name/mega-status - Statut Mega',
            'GET  /api/sessions/active - Sessions actives',
            'GET  /api/health - Santé du serveur',
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
    console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    console.log(`=========================================\n`);
});

export default app;