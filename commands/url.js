// ==================== commands/url.js ====================
import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage, downloadContentFromMessage } from '@whiskeysockets/baileys';
import { Readable } from 'stream';
import { contextInfo } from '../system/contextInfo.js';

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function url(devask, m, msg, args, extra) {
  try {
    const target = m.quoted ? m.quoted : m;
    const mime = target?.mimetype || target?.msg?.mimetype || '';
    const mtype = target?.mtype || '';

    // Vérifier le type de média supporté
    const isImage = /image\/(jpe?g|png|gif|webp)/.test(mime);
    const isVideo = /video\/(mp4|avi|mov|mkv|webm)/.test(mime);
    const isAudio = /audio\/(mpeg|mp4|ogg|wav|aac)/.test(mime);

    if (!isImage && !isVideo && !isAudio) {
      return devask.sendMessage(
        m.chat,
        { 
          text: '📸 *Veuillez répondre à une image, vidéo ou audio pour générer un lien.*\n\n📁 *Formats supportés:*\n• Images: JPG, PNG, GIF, WebP\n• Vidéos: MP4, AVI, MOV, MKV, WebM\n• Audios: MP3, M4A, OGG, WAV, AAC', 
          contextInfo: {
            ...contextInfo,
            mentionedJid: [m.sender]
          }
        },
        { quoted: m }
      );
    }

    let buffer;
    let mediaType = '';
    let fileExtension = '';

    // Déterminer le type de média et l'extension
    if (isImage) {
      mediaType = 'image';
      fileExtension = mime.includes('jpeg') ? 'jpg' : 
                     mime.includes('png') ? 'png' : 
                     mime.includes('gif') ? 'gif' : 'webp';
    } else if (isVideo) {
      mediaType = 'video';
      fileExtension = mime.includes('mp4') ? 'mp4' : 
                     mime.includes('avi') ? 'avi' : 
                     mime.includes('mov') ? 'mov' : 
                     mime.includes('mkv') ? 'mkv' : 'webm';
    } else if (isAudio) {
      mediaType = 'audio';
      fileExtension = mime.includes('mpeg') ? 'mp3' : 
                     mime.includes('mp4') ? 'm4a' : 
                     mime.includes('ogg') ? 'ogg' : 
                     mime.includes('wav') ? 'wav' : 'aac';
    }

    // Tentative avec target.download() si disponible
    if (typeof target.download === 'function') {
      buffer = await target.download();
    }

    // Sinon fallback sur downloadMediaMessage
    if (!buffer) {
      try {
        buffer = await downloadMediaMessage(target.msg || target.message[target.mtype], mediaType, { logger: devask.logger });
      } catch (err1) {
        // Fallback classique avec downloadContentFromMessage
        const node = target.msg || target.message?.[target.mtype];
        if (!node) throw new Error('Média introuvable pour téléchargement');

        const stream = await downloadContentFromMessage(node, mediaType);
        buffer = await streamToBuffer(stream);
      }
    }

    if (!buffer || buffer.length < 100) {
      return devask.sendMessage(
        m.chat,
        { 
          text: '❌ Impossible de lire ce média.', 
          contextInfo: {
            ...contextInfo,
            mentionedJid: [m.sender]
          }
        },
        { quoted: m }
      );
    }

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', Readable.from(buffer), `file.${fileExtension}`);

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: form.getHeaders()
    });

    const url = response.data;

    // Déterminer l'emoji et le texte selon le type de média
    let mediaEmoji = '📁';
    let mediaText = 'Fichier';
    
    if (isImage) {
      mediaEmoji = '🖼️';
      mediaText = 'Image';
    } else if (isVideo) {
      mediaEmoji = '🎥';
      mediaText = 'Vidéo';
    } else if (isAudio) {
      mediaEmoji = '🎵';
      mediaText = 'Audio';
    }

    const message = `> 𓊈 𝐀𝐒𝐊 𝐂𝐑𝐀𝐒𝐇𝐄𝐑 𝐕.1.⁰.⁰ 𓊉
╭════╍𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓╍════➷
│ ${mediaEmoji} *${mediaText} détecté(e)*
│ 📊 *Taille :* ${(buffer.length / 1024 / 1024).toFixed(2)} MB
│ ✅ *Lien généré :*
│ ${url}
╰══════════════╍═══➹
`.trim();

    await devask.sendMessage(
      m.chat,
      { 
        text: message, 
        contextInfo: {
          ...contextInfo,
          mentionedJid: [m.sender]
        }
      },
      { quoted: m }
    );

  } catch (err) {
    console.error('Erreur URL Catbox :', err.response?.data || err.message || err);
    await devask.sendMessage(
      m.chat,
      { 
        text: '❌ Une erreur est survenue lors de la génération du lien.', 
        contextInfo: {
          ...contextInfo,
          mentionedJid: [m.sender]
        }
      },
      { quoted: m }
    );
  }
}

export default { 
  name: "url", 
  run: url
};