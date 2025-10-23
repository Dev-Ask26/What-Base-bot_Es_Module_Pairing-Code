// ==================== checkAdminOrOwner.js (Multi-session) ====================
import decodeJid from './decodeJid.js';
import sessionManager from './sessionManager.js';

export default async function checkAdminOrOwner(devask, chatId, sender, participants = [], metadata = null) {
  const isGroup = chatId.endsWith('@g.us');

  // Nettoyage robuste des numéros
  const cleanNumber = (num) => {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  };

  const senderJid = decodeJid(sender);
  const senderNumber = cleanNumber(senderJid.split('@')[0]);

  // ✨ CORRECTION: Récupérer la session de l'utilisateur actuel
  const currentSession = sessionManager.getSessionBySender(senderNumber);
  
  // ✨ NOUVEAU: Vérifications basées sur la session
  let isSessionOwner = false;
  let isSessionSudo = false;
  let sessionId = null;

  if (currentSession) {
    sessionId = currentSession.sessionId || currentSession.name;
    isSessionOwner = sessionManager.isSessionOwner(senderNumber, sessionId);
    isSessionSudo = sessionManager.isSessionSudo(senderNumber, sessionId);
  }

  // ✨ MODIFIÉ: Récupérer tous les owners et sudo de TOUTES les sessions pour les permissions globales
  const allSessions = sessionManager.getAllSessions();
  const ownerNumbers = allSessions.map(s => cleanNumber(s.ownerNumber));
  
  // ✨ MODIFIÉ: Récupérer tous les sudo de toutes les sessions
  const sudoNumbers = allSessions.flatMap(s => 
    (s.sudo || []).map(num => cleanNumber(num))
  );

  console.log('🔍 Debug permissions:');
  console.log('- Sender number:', `"${senderNumber}"`);
  console.log('- Session:', currentSession?.name || 'Aucune');
  console.log('- isSessionOwner:', isSessionOwner);
  console.log('- isSessionSudo:', isSessionSudo);
  console.log('- Global owners:', ownerNumbers);
  console.log('- Global sudo:', sudoNumbers);

  // ✨ CORRECTION: Utiliser les permissions de session + permissions globales
  const isBotOwner = ownerNumbers.some(ownerNum => ownerNum === senderNumber) || isSessionOwner;
  const isSudo = sudoNumbers.some(sudoNum => sudoNum === senderNumber) || isSessionSudo;

  console.log('- Final isBotOwner:', isBotOwner);
  console.log('- Final isSudo:', isSudo);

  // Si pas un groupe
  if (!isGroup) {
    return {
      isAdmin: false,
      isOwner: isBotOwner,
      isSudo,
      isAdminOrOwner: isBotOwner || isSudo,
      isSessionOwner,
      isSessionSudo,
      session: currentSession,
      participant: null
    };
  }

  // Gestion des groupes
  try {
    if (!metadata) metadata = await devask.groupMetadata(chatId);
    if (!participants || participants.length === 0) participants = metadata.participants || [];
  } catch (e) {
    console.error('❌ Impossible de récupérer groupMetadata:', e);
    return {
      isAdmin: false,
      isOwner: isBotOwner,
      isSudo,
      isAdminOrOwner: isBotOwner || isSudo,
      isSessionOwner,
      isSessionSudo,
      session: currentSession,
      participant: null
    };
  }

  const participant = participants.find(p => {
    const jidToCheck = decodeJid(p.jid || p.id || '');
    return jidToCheck === senderJid;
  }) || null;

  const isAdmin = !!participant && (
    participant.admin === 'admin' ||
    participant.admin === 'superadmin' ||
    participant.role === 'admin' ||
    participant.role === 'superadmin' ||
    participant.isAdmin === true ||
    participant.isSuperAdmin === true
  );

  const isGroupOwner = metadata.owner && decodeJid(metadata.owner) === senderJid;
  const isOwnerUser = isBotOwner || isGroupOwner;

  return {
    isAdmin,
    isOwner: isOwnerUser,
    isSudo,
    isAdminOrOwner: isAdmin || isOwnerUser || isSudo,
    isSessionOwner,
    isSessionSudo,
    session: currentSession,
    participant
  };
}