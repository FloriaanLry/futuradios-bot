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

const CHANNEL_NAME = process.env.CHANNEL_NAME || 'hits';
const RADIO_URL = process.env.RADIO_URL || 'https://futuradiohits.ice.infomaniak.ch/frhits-128.mp3';
const TITRAGE_URL = process.env.TITRAGE_URL || 'https://futuradio.com/scripts/titrage/hits.txt';
const LOG_SERVER = 'logs-servers.txt';
const LOG_ERRORS = 'logs-errors.txt';
let connections = new Map();

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

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const botAvatar = client.user.displayAvatarURL();
    const botName = client.user.username;
    const botInviteLink = 'https://discord.com/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot';

    if (interaction.commandName === 'play') {
        const channel = await findBestChannel(interaction.guild);
        if (channel) playRadio(channel);
        const embed = new EmbedBuilder()
            .setTitle(botName)
            .setURL(botInviteLink)
            .setDescription(`🔊 Le bot est reconnecté et joue ${botName} !`)
            .setThumbnail(botAvatar)
            .setFooter({ text: 'Développé par https://florianleroy.fr', iconURL: 'https://imgur.com/YbiswCt' })
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
            .setFooter({ text: 'Développé par https://florianleroy.fr', iconURL: 'https://imgur.com/YbiswCt' })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply('❌ Erreur. Impossible de récupérer le titrage.');
        }
    }
});

client.login(process.env.TOKEN);
