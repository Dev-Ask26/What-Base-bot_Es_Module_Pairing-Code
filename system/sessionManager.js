// ==================== sessionManager.js ====================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "config.json");

class SessionManager {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(configPath, "utf8");
      this.config = JSON.parse(data);
      console.log("✅ Config multi-session chargée");
    } catch (err) {
      console.error("❌ Erreur chargement config.json:", err);
      this.config = { BOT_NAME: "ASK CRASHER", sessions: [] };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      console.log("✅ Config sauvegardée");
    } catch (err) {
      console.error("❌ Erreur sauvegarde config.json:", err);
    }
  }

  // Récupérer la session par sessionId
  getSessionBySessionId(sessionId) {
    if (!this.config?.sessions) return null;
    return this.config.sessions.find(s => s.sessionId === sessionId) || null;
  }

  // Récupérer la session par numéro d'owner
  getSessionByOwner(ownerNumber) {
    if (!this.config?.sessions) return null;
    const cleanOwner = this.cleanNumber(ownerNumber);
    return this.config.sessions.find(s => 
      this.cleanNumber(s.ownerNumber) === cleanOwner
    ) || null;
  }

  // Récupérer la session par sender (vérifie owner et sudo)
  getSessionBySender(senderNumber) {
    if (!this.config?.sessions) return null;
    const cleanSender = this.cleanNumber(senderNumber);
    
    // Cherche d'abord si c'est un owner
    let session = this.config.sessions.find(s => 
      this.cleanNumber(s.ownerNumber) === cleanSender
    );
    
    // Sinon cherche dans les sudo
    if (!session) {
      session = this.config.sessions.find(s => 
        s.sudo?.some(sudoNum => this.cleanNumber(sudoNum) === cleanSender)
      );
    }
    
    return session || null;
  }

  // Nettoyer un numéro de téléphone
  cleanNumber(num) {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  }

  // Obtenir le préfixe pour une session
  getPrefix(sessionId) {
    const session = this.getSessionBySessionId(sessionId);
    return session?.prefix || "!";
  }

  // Obtenir le mode pour une session
  getMode(sessionId) {
    const session = this.getSessionBySessionId(sessionId);
    return session?.mode || "public";
  }

  // Vérifier si un utilisateur est owner d'une session
  isSessionOwner(senderNumber, sessionId) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    return this.cleanNumber(session.ownerNumber) === this.cleanNumber(senderNumber);
  }

  // Vérifier si un utilisateur est sudo d'une session
  isSessionSudo(senderNumber, sessionId) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    return session.sudo?.some(sudoNum => 
      this.cleanNumber(sudoNum) === this.cleanNumber(senderNumber)
    ) || false;
  }

  // Mettre à jour le préfixe d'une session
  updatePrefix(sessionId, newPrefix) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    session.prefix = newPrefix;
    this.saveConfig();
    return true;
  }

  // Mettre à jour le mode d'une session
  updateMode(sessionId, newMode) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    if (!["public", "private"].includes(newMode)) return false;
    session.mode = newMode;
    this.saveConfig();
    return true;
  }

  // Ajouter un sudo à une session
  addSudo(sessionId, sudoNumber) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    if (!session.sudo) session.sudo = [];
    const cleanSudo = this.cleanNumber(sudoNumber);
    if (!session.sudo.some(s => this.cleanNumber(s) === cleanSudo)) {
      session.sudo.push(sudoNumber);
      this.saveConfig();
    }
    return true;
  }

  // Retirer un sudo d'une session
  removeSudo(sessionId, sudoNumber) {
    const session = this.getSessionBySessionId(sessionId);
    if (!session) return false;
    const cleanSudo = this.cleanNumber(sudoNumber);
    session.sudo = session.sudo?.filter(s => 
      this.cleanNumber(s) !== cleanSudo
    ) || [];
    this.saveConfig();
    return true;
  }

  // Obtenir toutes les sessions
  getAllSessions() {
    return this.config?.sessions || [];
  }

  // Recharger la config depuis le fichier
  reloadConfig() {
    this.loadConfig();
  }
}

// Export singleton
const sessionManager = new SessionManager();
export default sessionManager;