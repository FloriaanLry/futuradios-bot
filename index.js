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
let connections = new Map();

const commands = [
    {
        name: 'play',
        description: 'Reconnecte le bot et joue Futuradio',
        name_localizations: { fr: 'jouer', es: 'reproducir' }
    },
    {
        name: 'music',
        description: 'Affiche le titre actuellement en lecture',
        name_localizations: { fr: 'musique', es: 'musica' }
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('🔄 Rechargement des commandes...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Les commandes slash ont été mises à jour avec succès !');
    } catch (error) {
        console.error('❌ Erreur lors du rechargement des commandes:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const botAvatar = client.user.displayAvatarURL();
    const botName = client.user.username;
    const botInviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    
    if (interaction.commandName === 'play') {
        const channel = await findBestChannel(interaction.guild);
        if (channel) playRadio(channel);
        const embed = new EmbedBuilder()
            .setTitle(botName)
            .setURL(botInviteLink)
            .setDescription(`🔊 Lancement de ${botName} !`)
            .setThumbnail(botAvatar)
            .setFooter({ text: 'https://florianleroy.fr', iconURL: 'https://i.imgur.com/YbiswCt.png' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    } else if (interaction.commandName === 'musique') {
        try {
            const { data } = await axios.get(TITRAGE_URL);
            const embed = new EmbedBuilder()
                .setTitle(botName)
                .setURL(botInviteLink)
                .setDescription(`🎵 Actuellement sur ${botName} : **${data}**`)
                .setThumbnail(botAvatar)
                .setFooter({ text: 'https://florianleroy.fr', iconURL: 'https://i.imgur.com/YbiswCt.png' })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply('❌ Impossible de récupérer le titrage.');
        }
    }
});

async function updateStatus() {
    try {
        const { data } = await axios.get(TITRAGE_URL);
        if (client.user) {
            client.user.setPresence({
                activities: [{ name: `🎵 ${data}`, type: 0 }],
                status: 'online'
            });
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    await registerCommands();
    client.guilds.cache.forEach(async guild => {
        const channel = await findBestChannel(guild);
        if (channel) playRadio(channel);
    });
    updateStatus();
    setInterval(updateStatus, 20000);
});

client.login(process.env.TOKEN);
