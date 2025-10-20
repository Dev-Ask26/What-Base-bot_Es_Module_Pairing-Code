// ==================== server.js ====================
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ==================== Routes ====================

// Route pour la page principale (admin)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour la page de déploiement (utilisateurs)
app.get('/deploye.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'deploye.html'));
});

// ==================== API Routes ====================

// API pour récupérer la configuration
app.get('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json(config);
        } else {
            // Configuration par défaut si le fichier n'existe pas
            res.json({ 
                BOT_NAME: 'DEV ASK',
                sessions: [] 
            });
        }
    } catch (error) {
        console.error('❌ Erreur lecture config:', error);
        res.status(500).json({ 
            error: 'Erreur de lecture de la configuration',
            details: error.message 
        });
    }
});

// API pour sauvegarder la configuration
app.post('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const newConfig = req.body;

        // Validation basique
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({ error: 'Configuration invalide' });
        }

        // S'assurer que sessions est un tableau
        if (!Array.isArray(newConfig.sessions)) {
            newConfig.sessions = [];
        }

        // Sauvegarder la configuration
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        
        console.log('✅ Configuration sauvegardée avec succès');
        res.json({ 
            success: true, 
            message: 'Configuration sauvegardée',
            sessionsCount: newConfig.sessions.length 
        });
    } catch (error) {
        console.error('❌ Erreur sauvegarde config:', error);
        res.status(500).json({ 
            error: 'Erreur de sauvegarde',
            details: error.message 
        });
    }
});

// API pour récupérer le statut détaillé des sessions
app.get('/api/status', async (req, res) => {
    try {
        // Importer dynamiquement l'index.js pour accéder aux sessions actives
        const { activeSessions } = await import('./index.js');
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        
        const sessionsStatus = Array.from(activeSessions.entries()).map(([name, session]) => {
            const uptime = session.connected && session.performance.connectionTime 
                ? now - session.performance.connectionTime 
                : 0;
                
            const timeDisconnected = session.lastDisconnectTime 
                ? now - session.lastDisconnectTime 
                : 0;
                
            const willBeRemoved = !session.connected && timeDisconnected > FIVE_MINUTES;
            
            return {
                name,
                connected: session.connected,
                ownerNumber: session.config?.ownerNumber,
                prefix: session.config?.prefix || '.',
                mode: session.config?.mode || 'public',
                qrCode: session.qrCode,
                lastDisconnectTime: session.lastDisconnectTime,
                timeDisconnected: timeDisconnected,
                willBeRemoved: willBeRemoved,
                performance: {
                    uptime: uptime,
                    messageCount: session.performance?.messageCount || 0,
                    lastActivity: session.performance?.lastActivity || 0,
                    connectionTime: session.performance?.connectionTime || null
                },
                config: session.config || {}
            };
        });

        // Compter les statistiques
        const total = sessionsStatus.length;
        const connected = sessionsStatus.filter(s => s.connected).length;
        const disconnected = sessionsStatus.filter(s => !s.connected).length;
        const toBeRemoved = sessionsStatus.filter(s => s.willBeRemoved).length;
        
        res.json({ 
            sessions: sessionsStatus,
            timestamp: now,
            total,
            connected,
            disconnected,
            toBeRemoved,
            stats: {
                total,
                connected,
                disconnected,
                toBeRemoved
            }
        });
    } catch (error) {
        console.error('❌ API Status error:', error);
        res.json({ 
            sessions: [],
            timestamp: Date.now(),
            total: 0,
            connected: 0,
            disconnected: 0,
            toBeRemoved: 0,
            stats: {
                total: 0,
                connected: 0,
                disconnected: 0,
                toBeRemoved: 0
            }
        });
    }
});

// API pour supprimer manuellement une session
app.delete('/api/session/:name', async (req, res) => {
    try {
        const { removeSessionFromConfig } = await import('./index.js');
        const sessionName = req.params.name;
        
        if (!sessionName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nom de session manquant' 
            });
        }
        
        const success = removeSessionFromConfig(sessionName);
        if (success) {
            console.log(`✅ Session ${sessionName} supprimée manuellement`);
            res.json({ 
                success: true, 
                message: `Session ${sessionName} supprimée avec succès` 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Erreur lors de la suppression de la session' 
            });
        }
    } catch (error) {
        console.error('❌ Erreur suppression session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API pour obtenir les informations d'une session spécifique
app.get('/api/session/:name', async (req, res) => {
    try {
        const { activeSessions } = await import('./index.js');
        const sessionName = req.params.name;
        
        const session = activeSessions.get(sessionName);
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Session non trouvée' 
            });
        }
        
        res.json({
            success: true,
            session: {
                name: sessionName,
                connected: session.connected,
                config: session.config,
                performance: session.performance,
                qrCode: session.qrCode,
                lastDisconnectTime: session.lastDisconnectTime
            }
        });
    } catch (error) {
        console.error('❌ Erreur récupération session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API pour redémarrer une session spécifique
app.post('/api/session/:name/restart', async (req, res) => {
    try {
        const { activeSessions, loadConfig } = await import('./index.js');
        const sessionName = req.params.name;
        
        // Charger la configuration pour trouver la session
        const config = loadConfig();
        const sessionConfig = config.sessions.find(s => s.name === sessionName);
        
        if (!sessionConfig) {
            return res.status(404).json({ 
                success: false, 
                error: 'Configuration de session non trouvée' 
            });
        }
        
        // Arrêter la session actuelle si elle existe
        const currentSession = activeSessions.get(sessionName);
        if (currentSession && currentSession.socket) {
            currentSession.socket.end();
            activeSessions.delete(sessionName);
        }
        
        // Redémarrer la session (sera relancée automatiquement par le watcher)
        console.log(`🔄 Redémarrage manuel de la session: ${sessionName}`);
        
        res.json({ 
            success: true, 
            message: `Session ${sessionName} en cours de redémarrage` 
        });
    } catch (error) {
        console.error('❌ Erreur redémarrage session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API de santé du serveur
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
    });
});

// Route pour servir les fichiers statics (CSS, JS, images)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Route 404 pour les pages non trouvées
app.use((req, res) => {
    res.status(404).json({
        error: 'Page non trouvée',
        availableRoutes: [
            '/ - Page principale',
            '/deploye.html - Page de déploiement',
            '/monitor.html - Page de monitoring',
            '/api/config - API Configuration',
            '/api/status - API Statut',
            '/api/health - API Santé'
        ]
    });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
    console.error('❌ Erreur serveur:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n🌐 Serveur DevAsk Multi-Sessions démarré !`);
    console.log(`=========================================`);
    console.log(`📱 Page principale: http://localhost:${PORT}`);
    console.log(`🔑 Page de déploiement: http://localhost:${PORT}/deploye.html`);
    console.log(`📊 Page monitoring: http://localhost:${PORT}/monitor.html`);
    console.log(`🔧 API Configuration: http://localhost:${PORT}/api/config`);
    console.log(`📈 API Statut: http://localhost:${PORT}/api/status`);
    console.log(`❤️ API Santé: http://localhost:${PORT}/api/health`);
    console.log(`=========================================\n`);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du serveur en cours...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Arrêt du serveur demandé...');
    process.exit(0);
});

export default app;