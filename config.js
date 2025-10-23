// ==================== config.js ====================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "config.json");

// Lire le config.json
let configData;
try {
  configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (err) {
  console.error("❌ Erreur lecture config.json:", err);
  process.exit(1);
}

// Fonction pour récupérer la config d'une session spécifique
export function getSessionConfig(sessionId) {
  const session = configData.sessions.find(s => s.sessionId === sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} non trouvée dans config.json`);
  }
  return {
    ...configData,  // Garde les valeurs globales comme BOT_NAME si nécessaire
    ...session      // Override avec les valeurs spécifiques à la session
  };
}

// Export par défaut pour compatibilité (si tu as d'autres usages)
export default configData;