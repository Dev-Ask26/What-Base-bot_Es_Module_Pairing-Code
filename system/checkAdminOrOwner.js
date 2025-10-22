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

  // ✨ Récupérer toutes les sessions pour vérifier les owners globaux
  const allSessions = sessionManager.getAllSessions();
  const ownerNumbers = allSessions.map(s => cleanNumber(s.ownerNumber));
  
  // ✨ Récupérer tous les sudo de toutes les sessions
  const sudoNumbers = allSessions.flatMap(s => 
    (s.sudo || []).map(num => cleanNumber(num))
  );

  console.log('🔍 Debug permissions:');
  console.log('- Owner numbers:', ownerNumbers);
  console.log('- Sudo numbers:', sudoNumbers);
  console.log('- Sender number:', `"${senderNumber}"`);
  console.log('- Sender JID:', senderJid);

  // Comparaison plus robuste
  const isBotOwner = ownerNumbers.some(ownerNum => ownerNum === senderNumber);
  const isSudo = sudoNumbers.some(sudoNum => sudoNum === senderNumber);

  console.log('- isBotOwner:', isBotOwner);
  console.log('- isSudo:', isSudo);

  // Si pas un groupe
  if (!isGroup) {
    return {
      isAdmin: false,
      isOwner: isBotOwner,
      isSudo,
      isAdminOrOwner: isBotOwner || isSudo,
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
    participant
  };
}