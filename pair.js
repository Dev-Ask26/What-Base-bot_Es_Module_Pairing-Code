import express from 'express';
import fs from 'fs-extra';
import { exec } from "child_process";
import pino from "pino";
import { Boom } from "@hapi/boom";
import crypto from 'crypto';

const router = express.Router();

const MESSAGE = process.env.MESSAGE || `
> ▬▬ι══════════════ι▬▬
    𓊈 𝐀𝐒𝐊 𝐂𝐑𝐀𝐒𝐇𝐄𝐑 𝐕.1.00 𓊉
> ▬▬ι══════════════ι▬▬

🚨🍷WELCOME BACK 📵🚨
> *❝ Se message est accordé avec votre session id ❞*
\`\`\`⌘❀══════◄••❀••►═════⌘\`\`\`
\`\`\`ASK CRASHER V1 WEB\`\`\`

*_FOLLOW SUPPORT_*

_. https://whatsapp.com/channel/0029VaiPkRPLY6d0qEX50e2k ._
\`\`\`⌘❀══════◄••❀••►═════⌘\`\`\`

> 𓆩〭〬⛃͢𝐃𝐒 𝐀𝐒𝐊 ⁴¹⿕ 
> 𓆩〭〬⛃͢ MR PROBLÈMATIQUE 𝐃𝐒 ⁴¹⿕
`;

import { upload } from './mega.js';
import {
    default as makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} from "@whiskeysockets/baileys";

// Clear auth directory at startup
if (fs.existsSync('./session_pair')) {
    fs.emptyDirSync('./session_pair');
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    async function StartSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session_pair`);

        try {
            const devask = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!devask.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await devask.requestPairingCode(num);
                if (!res.headersSent) await res.send({ code });
            }

            devask.ev.on('creds.update', saveCreds);

            devask.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {  
                    try {
                        await delay(10000);

                        const auth_path = './session_pair/';
                        const user = devask.user.id;

                        // Random Mega ID generator
                        function randomMegaId(length = 6, numberLength = 4) {
                            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            let result = '';
                            for (let i = 0; i < length; i++) {
                                result += characters.charAt(Math.floor(Math.random() * characters.length));
                            }
                            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                            return `${result}${number}`;
                        }

                        // Upload creds.json to Mega
                        const mega_url = await upload(fs.createReadStream(auth_path + 'creds.json'), `${randomMegaId()}.json`);

                        // Extraire fileID et key en toute sécurité
                        let fileID, key;
                        if (mega_url.includes('#')) {
                            const parts = mega_url.split('/file/')[1].split('#');
                            fileID = parts[0];
                            key = parts[1];
                        } else {
                            fileID = mega_url.split('/file/')[1];
                            key = crypto.randomBytes(32).toString('base64'); // fallback
                        }

                        // Construire la session avec préfixe ASK-CRASHER-V1~
                        const sessionString = `ASK-CRASHER-V1~${fileID}#${key}`;

                        // Envoyer la session à l'utilisateur
                        const msgsss = await devask.sendMessage(user, { text: sessionString });

                        await devask.sendMessage(user, { 
                            image: { 
                                url: "https://files.catbox.moe/zq1kuc.jpg" 
                            }, 
                            caption: MESSAGE,
                            contextInfo: {
                                isForwarded: true,
                                mentionedJid: [user],
                                forwardedNewsletterMessageInfo: {
                                    newsletterName: "𝐀𝐒𝐊 𝐓𝐄𝐂𝐇 || 𝐎𝐅𝐅𝐂",
                                    newsletterJid: `120363330359618597@newsletter`
                                },
                            }
                        }, { quoted: msgsss });

                        await delay(1000);
                        await fs.emptyDir(auth_path);

                    } catch (e) {
                        console.log("Error during upload or send:", e);
                    }
                }

                if (connection === "close") {
                    const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                    if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                        console.log("Reconnecting...");
                        StartSession().catch(console.log);
                    } else {
                        console.log('Connection closed unexpectedly:', reason);
                        await delay(5000);
                        exec('pm2 restart qasim');
                    }
                }
            });

        } catch (err) {
            console.log("Error in SUHAIL function:", err);
            exec('pm2 restart qasim');
            StartSession();
            await fs.emptyDir('./session_pair');
            if (!res.headersSent) await res.send({ code: "Il semble qu'il yah une session existant sur votre numéro essaie après 🫩" });
        }
    }

    await StartSession();
});

export default router;