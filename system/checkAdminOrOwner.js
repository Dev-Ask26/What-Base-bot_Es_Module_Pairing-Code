// ==================== checkAdminOrOwner.js ====================
import decodeJid from './decodeJid.js';

export default async function checkAdminOrOwner(devask, chatId, sender, participants = [], metadata = null, userConfig = null) {
  const isGroup = chatId.endsWith('@g.us');

  // Nettoyage robuste des numéros
  const cleanNumber = (num) => {
    if (!num) return '';
    return num.toString().trim().replace(/[^\d]/g, '');
  };

  const senderJid = decodeJid(sender);
  const senderNumber = cleanNumber(senderJid.split('@')[0]);

  // Utilise les données de userConfig si fourni
  let ownerNumbers = [];
  let sudoNumbers = [];

  if (userConfig) {
    // Configuration spécifique à l'utilisateur
    ownerNumbers = [cleanNumber(userConfig.ownerNumber)].filter(o => o.length > 0);
    sudoNumbers = (userConfig.sudo || []).map(s => cleanNumber(s)).filter(s => s.length > 0);
  } else {
    // Fallback à la config globale (pour compatibilité)
    const config = await import('../config.js');
    ownerNumbers = config.globalConfig.OWNER_NUMBER.split(',')
      .map(o => cleanNumber(o))
      .filter(o => o.length > 0);
    sudoNumbers = (config.globalConfig.SUDO || []).map(s => cleanNumber(s)).filter(s => s.length > 0);
  }

  console.log('🔍 Debug permissions:');
  console.log('- Owner numbers:', ownerNumbers);
  console.log('- Sudo numbers:', sudoNumbers);
  console.log('- Sender number:', `"${senderNumber}"`);
  console.log('- User config:', userConfig ? 'présente' : 'absente');

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

  // Pour les groupes
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