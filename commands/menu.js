import { contextInfo } from '../system/contextInfo.js';

async function menu(devask, m, msg, args, extra) {
    const { chatType, userPrefix, userMode, isOwner, isSudo } = extra;
    const pushname = m.pushName || "No Name";    
    
    await devask.sendMessage(m.chat, { 
      react: { text: "📁", key: m.key } 
    });    
    
    let menuText = `> ➹═════════════╍═══➷
> ▬▬ι══════════════ι▬▬
   𓊈 𝐀𝐒𝐊 𝐂𝐑𝐀𝐒𝐇𝐄𝐑 𝐕.1.⁰.⁰ 𓊉
> ▬▬ι══════════════ι▬▬
> ➪ 𝐔𝐬𝐞𝐫 : *${pushname}*
> ➪ 𝐏𝐫𝐞𝐟𝐢𝐱𝐞 : *[${userPrefix}]*
> ➪ 𝐌𝐨𝐝𝐞 : *${userMode}*
> ➪ 𝐎𝐰𝐧𝐞𝐫 : *${isOwner ? '✅' : '❌'}*
> ➪ 𝐒𝐮𝐝𝐨 : *${isSudo ? '✅' : '❌'}*
> ➪ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : 𝐆𝐫𝐚𝐭𝐮𝐢𝐭 𝐃𝐮 𝐁𝐨𝐭
> ▬▬ι══════════════ι▬▬

> ╭════╍𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐬╍═══➷
> ║ ◦ 𝚂𝙴𝚂𝚂𝙸𝙾𝙽
> ║ ◦ 𝙳𝙴𝚅
> ║ ◦ 𝙰𝙻𝙸𝚅𝙴
> ║ ◦ 𝙼𝙴𝙽𝚄
> ║ ◦ 𝙱𝚄𝙶𝙼𝙴𝙽𝚄
> ║ ◦ 𝚂𝚃𝙸𝙲𝙺𝙴𝚁
> ║ ◦ 𝚃𝙰𝙺𝙴
> ║ ◦ 𝚄𝚁𝙻
> ║ ◦ 😏 /viewonce
> ║ ◦ 𝙿𝚁𝙾𝙼𝙾𝚃𝙴
> ║ ◦ 𝙳𝙴𝙼𝙾𝚃𝙴
> ║ ◦ 𝚁𝙴𝙼𝙾𝚅𝙴
> ║ ◦ 𝙼𝙴𝙽𝚃𝙸𝙾𝙽
> ╰══════════════╍═══➹
> ▬▬ι══════════════ι▬▬
`;
  
    await devask.sendMessage(m.chat, { 
      image: { url: 'https://files.catbox.moe/frbcih.jpg' }, 
      caption: menuText,
      contextInfo: {
        ...contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m });
}

export default { 
  name: "menu", 
  run: menu
};