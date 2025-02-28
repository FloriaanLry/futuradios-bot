import { Client, GatewayIntentBits, ChannelType, REST, Routes } from 'discord.js';
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
        const { data: remoteVersion } = await axios.get(VERSION_URL);
        let localVersion = '';

        if (fs.existsSync(VERSION_FILE)) {
            localVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
        }

        if (localVersion !== remoteVersion.trim()) {
            console.log('🔄 Nouvelle version détectée. Mise à jour en cours...');
            const { data: newScript } = await axios.get(SCRIPT_URL);
            fs.writeFileSync('index.js', newScript);
            fs.writeFileSync(VERSION_FILE, remoteVersion.trim());
            console.log('✅ Mise à jour effectuée. Redémarrage du bot...');
            exec('pm2 restart index.js');
            process.exit();
        } else {
            console.log('✅ Le bot est à jour.');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la vérification de mise à jour :', error);
    }
}

await checkForUpdate();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const CHANNEL_NAME = process.env.CHANNEL_NAME || 'music';
const RADIO_URL = process.env.RADIO_URL;
const TITRAGE_URL = process.env.TITRAGE_URL;
const LOG_SERVER = 'logs-servers.txt';
const LOG_ERRORS = 'logs-errors.txt';
let connections = new Map();

[LOG_SERVER, LOG_ERRORS].forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '', { mode: 0o777 });
    }
});

async function logServerLaunch(guild) {
    const logMessage = `Le bot s'est lancé dans le serveur : ${guild.name}, ID: ${guild.id}\n`;
    fs.appendFileSync(LOG_SERVER, logMessage);
}

async function logError(errorMessage) {
    const logMessage = `[${new Date().toISOString()}] Erreur : ${errorMessage}\n`;
    fs.appendFileSync(LOG_ERRORS, logMessage);
}

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
        logError(`Impossible de se connecter au salon vocal du serveur ${channel.guild.name} (ID: ${channel.guild.id}): ${error.message}`);
    }
}

async function registerCommands() {
    const commands = [
        {
            name: 'play',
            description: 'Reconnecte le bot et joue Futuradio'
        },
        {
            name: 'musique',
            description: 'Affiche le titre actuellement en lecture'
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('🔄 Rechargement des commandes...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Les commandes slash ont été enregistrées avec succès !');
    } catch (error) {
        console.error('❌ Erreur lors du rechargement des commandes:', error);
    }
}

client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    await registerCommands();
    client.guilds.cache.forEach(async guild => {
        logServerLaunch(guild);
        const channel = await findBestChannel(guild);
        if (channel) playRadio(channel);
    });
    updateStatus();
    setInterval(updateStatus, 30000);
});

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

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'play') {
        const channel = await findBestChannel(interaction.guild);
        if (channel) playRadio(channel);
        await interaction.reply('🔊 Le bot est reconnecté et joue Futuradio !');
    } else if (interaction.commandName === 'musique') {
        try {
            const { data } = await axios.get(TITRAGE_URL);
            await interaction.reply(`🎵 Actuellement en lecture : **${data}**`);
        } catch (error) {
            await interaction.reply('❌ Impossible de récupérer le titrage.');
        }
    }
});

client.on('guildCreate', async guild => {
    logServerLaunch(guild);
    await registerCommands();
    const channel = await findBestChannel(guild);
    if (channel) playRadio(channel);
});

client.login(process.env.TOKEN);
