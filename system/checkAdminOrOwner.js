// ==================== checkAdminOrOwner.js ====================
import decodeJid from './decodeJid.js';

export default async function checkAdminOrOwner(devask, chatId, sender, participants = [], metadata = null, config = {}) {
  const isGroup = chatId.endsWith('@g.us');

  // Nettoyage robuste des numéros
  const cleanNumber = (num) => {
    if (!num) return '';
    // Supprimer tout sauf les chiffres et le +
    return num.toString().trim().replace(/[^\d+]/g, '');
  };

  // Normaliser le numéro (supprimer le + si présent et garder format international)
  const normalizeNumber = (num) => {
    const cleaned = cleanNumber(num);
    // Si le numéro commence par +, le garder, sinon formater en international
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    // Ajouter l'indicatif par défaut si absent
    if (cleaned.length === 9 && !cleaned.startsWith('221')) {
      return '221' + cleaned;
    }
    return cleaned;
  };

  // Utiliser la configuration de session si fournie
  const ownerNumber = config.OWNER_NUMBER || '';
  const sudoNumbers = config.SUDO || [];
  const sessionName = config.name || 'default';

  // Préparer les listes de numéros
  const ownerNumbers = (Array.isArray(ownerNumber) ? ownerNumber : ownerNumber.split(','))
    .map(o => normalizeNumber(o))
    .filter(o => o.length > 0);

  const cleanSudoNumbers = (Array.isArray(sudoNumbers) ? sudoNumbers : [])
    .map(s => normalizeNumber(s))
    .filter(s => s.length > 0);

  const senderJid = decodeJid(sender);
  const senderNumber = normalizeNumber(senderJid.split('@')[0]);

  console.log(`🔍 [${sessionName}] Debug permissions:`);
  console.log(`   - Chat: ${isGroup ? 'Groupe' : 'Privé'}`);
  console.log(`   - Owner numbers:`, ownerNumbers);
  console.log(`   - Sudo numbers:`, cleanSudoNumbers);
  console.log(`   - Sender: ${senderNumber} (${senderJid})`);

  // Comparaison robuste des numéros
  const isBotOwner = ownerNumbers.some(ownerNum => {
    // Comparaison exacte
    if (ownerNum === senderNumber) return true;
    
    // Comparaison sans indicatif si nécessaire
    const ownerWithoutCode = ownerNum.replace(/^\++?221/, '');
    const senderWithoutCode = senderNumber.replace(/^\++?221/, '');
    
    if (ownerWithoutCode === senderWithoutCode) return true;
    
    // Comparaison avec/sans +
    if (ownerNum === `+${senderNumber}` || senderNumber === `+${ownerNum}`) return true;
    
    return false;
  });

  const isSudo = cleanSudoNumbers.some(sudoNum => {
    if (sudoNum === senderNumber) return true;
    
    const sudoWithoutCode = sudoNum.replace(/^\++?221/, '');
    const senderWithoutCode = senderNumber.replace(/^\++?221/, '');
    
    if (sudoWithoutCode === senderWithoutCode) return true;
    
    if (sudoNum === `+${senderNumber}` || senderNumber === `+${sudoNum}`) return true;
    
    return false;
  });

  console.log(`   - Résultats: Owner=${isBotOwner}, Sudo=${isSudo}`);

  // Si pas un groupe, retourner les permissions de base
  if (!isGroup) {
    const result = {
      isAdmin: false,
      isOwner: isBotOwner,
      isSudo,
      isAdminOrOwner: isBotOwner || isSudo,
      isGroupOwner: false,
      participant: null,
      sessionName: sessionName
    };
    
    console.log(`   - Permissions privé:`, result);
    return result;
  }

  // Récupération des métadonnées du groupe si nécessaire
  let groupMetadata = metadata;
  let groupParticipants = participants;
  
  try {
    if (!groupMetadata) {
      groupMetadata = await devask.groupMetadata(chatId);
    }
    if (!groupParticipants || groupParticipants.length === 0) {
      groupParticipants = groupMetadata.participants || [];
    }
  } catch (e) {
    console.error(`❌ [${sessionName}] Impossible de récupérer groupMetadata:`, e.message);
    return {
      isAdmin: false,
      isOwner: isBotOwner,
      isSudo,
      isAdminOrOwner: isBotOwner || isSudo,
      isGroupOwner: false,
      participant: null,
      sessionName: sessionName
    };
  }

  // Recherche du participant dans le groupe
  const participant = groupParticipants.find(p => {
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
  const groupOwnerJid = groupMetadata.owner || groupMetadata.creator;
  const isGroupOwner = groupOwnerJid && decodeJid(groupOwnerJid) === senderJid;

  // Le propriétaire est soit le owner du bot, soit le propriétaire du groupe
  const isOwnerUser = isBotOwner || isGroupOwner;

  const result = {
    isAdmin,
    isOwner: isOwnerUser,
    isSudo,
    isAdminOrOwner: isAdmin || isOwnerUser || isSudo,
    isGroupOwner,
    participant,
    sessionName: sessionName,
    groupMetadata: {
      id: chatId,
      subject: groupMetadata.subject,
      owner: groupOwnerJid,
      participantsCount: groupParticipants.length
    }
  };

  console.log(`   - Permissions groupe:`, {
    isAdmin: result.isAdmin,
    isOwner: result.isOwner,
    isGroupOwner: result.isGroupOwner,
    isSudo: result.isSudo
  });

  return result;
}