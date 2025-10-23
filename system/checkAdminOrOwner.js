// ==================== checkAdminOrOwner.js ====================
import decodeJid from './decodeJid.js';

export default async function checkAdminOrOwner(devask, chatId, sender, participants = [], metadata = null, sessionConfig) {
  const isGroup = chatId.endsWith('@g.us');

  // Nettoyage robuste des numéros
  const cleanNumber = (num) => {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  };

  // Utilise les valeurs spécifiques à la session
  const ownerNumbers = [cleanNumber(sessionConfig.ownerNumber)];  // Un seul owner par session
  const sudoNumbers = (sessionConfig.sudo || []).map(s => cleanNumber(s)).filter(s => s.length > 0);
  
  const senderJid = decodeJid(sender);
  const senderNumber = cleanNumber(senderJid.split('@')[0]);

  console.log('🔍 Debug permissions:');
  console.log('- Owner numbers:', ownerNumbers);
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

  // ... le reste du code pour les groupes
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