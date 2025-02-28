import { Client, GatewayIntentBits, ChannelType, REST, Routes } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const CHANNEL_NAME = process.env.CHANNEL_NAME || 'hits';
const RADIO_URL = process.env.RADIO_URL || 'https://futuradiohits.ice.infomaniak.ch/frhits-128.mp3';
const TITRAGE_URL = process.env.TITRAGE_URL || 'https://futuradio.com/scripts/titrage/hits.txt';
const LOG_SERVER = 'logs-servers.txt';
const LOG_ERRORS = 'logs-errors.txt';
let connection = null;

// Vérifier et créer les fichiers de logs avec permissions 777 si inexistants
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

async function createOrGetChannel(guild) {
    let channel = guild.channels.cache.find(ch => ch.name === CHANNEL_NAME && ch.type === ChannelType.GuildVoice);
    if (!channel) {
        channel = await guild.channels.create({ name: CHANNEL_NAME, type: ChannelType.GuildVoice });
    }
    return channel;
}

async function playRadio(channel) {
    try {
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        const player = createAudioPlayer({ behavior: NoSubscriberBehavior.Play });
        const resource = createAudioResource(RADIO_URL);
        player.play(resource);
        connection.subscribe(player);
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
    const guild = client.guilds.cache.first();
    if (guild) {
        logServerLaunch(guild);
        const channel = await createOrGetChannel(guild);
        playRadio(channel);
    }
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
        const channel = await createOrGetChannel(interaction.guild);
        playRadio(channel);
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
    const channel = await createOrGetChannel(guild);
    playRadio(channel);
});

client.login(process.env.TOKEN);
