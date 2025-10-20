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

// ==================== Fonctions Helper ====================

function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
      return { BOT_NAME: 'ASK CRASHER', sessions: [] };
    }
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData;
  } catch (error) {
    console.error('❌ Erreur chargement config:', error);
    return { BOT_NAME: 'ASK CRASHER', sessions: [] };
  }
}

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

// Route unique : la page de déploiement
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'deploye.html'));
});

// ==================== API Routes ====================

// API pour récupérer la configuration
app.get('/api/config', (req, res) => {
    try {
        const config = loadConfig();
        res.json(config);
    } catch (error) {
        console.error('❌ Erreur lecture config:', error);
        res.status(500).json({ 
            error: 'Erreur de lecture de la configuration'
        });
    }
});

// API pour sauvegarder la configuration
app.post('/api/config', (req, res) => {
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

        // Sauvegarder la configuration
        const success = saveConfig(newConfig);

        if (success) {
            console.log('✅ Configuration ASK CRASHER sauvegardée');
            res.json({ 
                success: true, 
                message: 'Session déployée avec succès!',
                sessionsCount: newConfig.sessions.length 
            });
        } else {
            throw new Error('Échec de la sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur sauvegarde config:', error);
        res.status(500).json({ 
            error: 'Erreur lors du déploiement'
        });
    }
});

// API de santé du serveur
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ASK CRASHER Server Running',
        timestamp: new Date().toISOString()
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
    console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
    console.log(`=========================================\n`);
});

export default app;