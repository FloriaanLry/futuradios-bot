import { Client, GatewayIntentBits, ChannelType, REST, Routes, EmbedBuilder } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { exec } from 'child_process';

dotenv.config();

const VERSION_FILE = 'version.txt';
const VERSION_URL = 'https://raw.githubusercontent.com/FloriaanLry/futuradios-bot/refs/heads/main/version.txt';
const SCRIPT_URL = 'https://raw.githubusercontent.com/FloriaanLry/futuradios-bot/refs/heads/main/index.js';

async function checkForUpdate() {
    try {
        console.log('🔎 Vérification des mises à jour...');
        const response = await axios.get(VERSION_URL);
        if (!response || !response.data) {
            throw new Error('Réponse invalide de la requête de version.');
        }
        const remoteVersion = response.data.toString().trim();
        let localVersion = '';

        if (fs.existsSync(VERSION_FILE)) {
            localVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
        }

        console.log(`📌 Version locale : ${localVersion || 'Aucune'}`);
        console.log(`🌍 Version distante : ${remoteVersion}`);

        if (localVersion !== remoteVersion) {
            console.log('🔄 Nouvelle version détectée. Mise à jour en cours...');
            const scriptResponse = await axios.get(SCRIPT_URL);
            if (!scriptResponse || !scriptResponse.data) {
                throw new Error('Impossible de récupérer le script mis à jour.');
            }
            fs.writeFileSync('index.js', scriptResponse.data);
            fs.writeFileSync(VERSION_FILE, remoteVersion);
            console.log('✅ Mise à jour effectuée. Redémarrage du bot dans 5 secondes...');
            
            setTimeout(() => {
                exec('pm2 restart index.js', (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Erreur lors du redémarrage du bot : ${error.message}`);
                        return;
                    }
                    console.log(`✅ Bot redémarré avec succès. Stdout: ${stdout}`);
                    process.exit();
                });
            }, 5000);
        } else {
            console.log('✅ Le bot est à jour, aucune mise à jour nécessaire.');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la vérification de mise à jour :', error.message);
    }
}

await checkForUpdate();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const CHANNEL_NAME = process.env.CHANNEL_NAME || 'radio';
const RADIO_URL = process.env.RADIO_URL;
const TITRAGE_URL = process.env.TITRAGE_URL;
const LOG_SERVER = 'logs-servers.txt';
const LOG_ERRORS = 'logs-errors.txt';
let connections = new Map();

// Vérifier et créer les fichiers de logs avec permissions 777 si inexistants
[LOG_SERVER, LOG_ERRORS].forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '', { mode: 0o777 });
    }
});

async function findBestChannel(guild) {
    return guild.channels.cache.find(ch => ch.type === ChannelType.GuildVoice && ch.name.includes(CHANNEL_NAME)) ||
           guild.channels.cache.find(ch => ch.type === ChannelType.GuildVoice);
}

async function playRadio(channel) {
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        const player = createAudioPlayer({ behavior: NoSubscriberBehavior.Play });
        const resource = createAudioResource(RADIO_URL);
        player.play(resource);
        connection.subscribe(player);
        connections.set(channel.guild.id, connection);
    } catch (error) {
        console.error(`Erreur lors de la connexion au salon vocal : ${error.message}`);
    }
}

async function updateStatus() {
    try {
        const { data } = await axios.get(TITRAGE_URL);
        if (client.user) {
            client.user.setPresence({
                activities: [{ name: `${data} 🎵`, type: 0 }],
                status: 'online'
            });
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.guilds.cache.forEach(async guild => {
        const channel = await findBestChannel(guild);
        if (channel) playRadio(channel);
    });
    updateStatus();
    setInterval(updateStatus, 30000);
});

client.login(process.env.TOKEN);
