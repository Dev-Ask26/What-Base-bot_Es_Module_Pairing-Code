// ==================== checkAdminOrOwner.js ====================
import decodeJid from './decodeJid.js';

export default async function checkAdminOrOwner(devask, chatId, sender, participants = [], metadata = null, config = {}) {
  const isGroup = chatId.endsWith('@g.us');

  // Nettoyage robuste des numéros
  const cleanNumber = (num) => {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  };

  // Utiliser la configuration de session si fournie, sinon utiliser les valeurs par défaut
  const ownerNumber = config.OWNER_NUMBER || '';
  const sudoNumbers = config.SUDO || [];

  const ownerNumbers = ownerNumber.split(',')
    .map(o => cleanNumber(o))
    .filter(o => o.length > 0);

  const cleanSudoNumbers = sudoNumbers.map(s => cleanNumber(s)).filter(s => s.length > 0);
  
  const senderJid = decodeJid(sender);
  const senderNumber = cleanNumber(senderJid.split('@')[0]);

  console.log('🔍 Debug permissions:');
  console.log('- Session config:', config.name || 'default');
  console.log('- Owner numbers:', ownerNumbers);
  console.log('- Sudo numbers:', cleanSudoNumbers);
  console.log('- Sender number:', `"${senderNumber}"`);
  console.log('- Sender JID:', senderJid);

  // Comparaison plus robuste
  const isBotOwner = ownerNumbers.some(ownerNum => ownerNum === senderNumber);
  const isSudo = cleanSudoNumbers.some(sudoNum => sudoNum === senderNumber);

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

  // Récupération des métadonnées du groupe si nécessaire
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

  // Recherche du participant dans le groupe
  const participant = participants.find(p => {
    const jidToCheck = decodeJid(p.jid || p.id || '');
    return jidToCheck === senderJid;
  }) || null;

  // Vérification des permissions d'admin dans le groupe
  const isAdmin = !!participant && (
    participant.admin === 'admin' ||
    participant.admin === 'superadmin' ||
    participant.role === 'admin' ||
    participant.role === 'superadmin' ||
    participant.isAdmin === true ||
    participant.isSuperAdmin === true
  );

  // Vérification si c'est le propriétaire du groupe
  const isGroupOwner = metadata.owner && decodeJid(metadata.owner) === senderJid;
  
  // Le propriétaire est soit le owner du bot, soit le propriétaire du groupe
  const isOwnerUser = isBotOwner || isGroupOwner;

  return {
    isAdmin,
    isOwner: isOwnerUser,
    isSudo,
    isAdminOrOwner: isAdmin || isOwnerUser || isSudo,
    participant
  };
}