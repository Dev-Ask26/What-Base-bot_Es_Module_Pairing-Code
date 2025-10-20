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
                status: activeSession ? (activeSession.connected ? 'connected' : 'disconnected') : 'not_started',
                hasQr: activeSession && activeSession.qrCode ? true : false,
                lastActivity: activeSession?.performance?.lastActivity || null
            };
        });

        res.json({
            ...config,
            sessions: sessionsWithStatus,
            activeSessionsCount: activeSessions.size
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
            if (newSessions.length > 0) {
                console.log(`🎯 Détection de ${newSessions.length} nouvelle(s) session(s) à démarrer:`);
                
                newSessions.forEach(session => {
                    console.log(`   ➕ Démarrage de: ${session.name} (${session.ownerNumber})`);
                    startBotForSession(session).catch(error => {
                        console.error(`❌ Erreur démarrage session ${session.name}:`, error.message);
                    });
                });
            }

            res.json({ 
                success: true, 
                message: 'Session déployée avec succès!',
                sessionsCount: newConfig.sessions.length,
                newSessionsStarted: newSessions.length,
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
            return res.json({ 
                success: true, 
                message: 'Session déjà active',
                sessionName: sessionName
            });
        }

        // Démarrer la session
        await startBotForSession(session);
        
        res.json({ 
            success: true, 
            message: 'Session démarrée avec succès',
            sessionName: sessionName
        });

    } catch (error) {
        console.error('❌ Erreur démarrage session:', error);
        res.status(500).json({ 
            error: 'Erreur lors du démarrage: ' + error.message
        });
    }
});

// API pour voir les sessions actives
app.get('/api/sessions/active', (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([name, session]) => ({
            name,
            connected: session.connected,
            hasQr: !!session.qrCode,
            ownerNumber: session.config?.ownerNumber,
            performance: session.performance,
            lastDisconnectTime: session.lastDisconnectTime
        }));

        res.json({
            total: activeSessions.size,
            sessions: sessions
        });
    } catch (error) {
        console.error('❌ Erreur récupération sessions:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API pour redémarrer toutes les sessions
app.post('/api/sessions/restart-all', async (req, res) => {
    try {
        const config = loadConfig();
        const sessions = config.sessions || [];
        
        console.log('🔄 Redémarrage de toutes les sessions...');
        
        let startedCount = 0;
        for (const session of sessions) {
            try {
                await startBotForSession(session);
                startedCount++;
            } catch (error) {
                console.error(`❌ Erreur session ${session.name}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            message: `${startedCount}/${sessions.length} sessions redémarrées`,
            sessionsStarted: startedCount,
            totalSessions: sessions.length
        });
        
    } catch (error) {
        console.error('❌ Erreur redémarrage sessions:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API de santé du serveur
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ASK CRASHER Server Running',
        timestamp: new Date().toISOString(),
        activeSessions: activeSessions.size,
        uptime: process.uptime()
    });
});

// Route 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Page non trouvée',
        message: 'Utilisez / pour déployer une session ASK CRASHER'
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
    console.log(`=========================================\n`);
});

export default app;