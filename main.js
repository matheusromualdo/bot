// Servidor HTTP para manter o bot online (Replit + UptimeRobot)
const http = require('http');

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { Client: WppClient, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Discord Client
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

discordClient.once('ready', () => {
    console.log(`🤖 Logado no Discord como ${discordClient.user.tag}`);
});

// WhatsApp Client
const wppClient = new WppClient({
    authStrategy: new LocalAuth()
});

wppClient.on('qr', qr => qrcode.generate(qr, { small: true }));
wppClient.on('authenticated', () => console.log('✅ Autenticado com sucesso!'));
wppClient.on('auth_failure', msg => console.error('❌ Falha de autenticação:', msg));
wppClient.on('ready', () => console.log('📱 WhatsApp pronto!'));
wppClient.on('disconnected', reason => console.error('⚠️ Desconectado:', reason));

// Recebe mensagens do Discord e repassa
discordClient.on('messageCreate', async message => {
    if (message.author.bot || message.channelId !== process.env.DISCORD_CHANNEL_ORIGEM) return;

    try {
        const chatWhatsApp = await wppClient.getChatById(process.env.WHATSAPP_CHAT_DESTINO);
        const discordChannelDestino = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_DESTINO);

        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const media = await MessageMedia.fromUrl(attachment.url);

                await chatWhatsApp.sendMessage(media, { caption: message.content || '' });
                await discordChannelDestino.send({
                    content: message.content || '',
                    files: [attachment.url]
                });
            }
        } else if (message.content) {
            await chatWhatsApp.sendMessage(message.content);
            await discordChannelDestino.send(message.content);
        }
    } catch (error) {
        console.error('Erro ao retransmitir mensagem:', error);
    }
});

// Recebe mensagens do WhatsApp e repassa
wppClient.on('message', async msg => {
    if (msg.from !== process.env.WHATSAPP_CHAT_ORIGEM) return;

    try {
        const discordChannel = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_DESTINO);
        const chatWhatsApp = await wppClient.getChatById(process.env.WHATSAPP_CHAT_DESTINO);
        const content = msg.body || '';

        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            const attachment = new AttachmentBuilder(
                Buffer.from(media.data, 'base64'),
                { name: `media_${Date.now()}.${media.mimetype.split('/')[1]}` }
            );

            await discordChannel.send({
                content: content,
                files: [attachment]
            });

            await chatWhatsApp.sendMessage(media, { caption: content });
        } else {
            await discordChannel.send(content);
            await chatWhatsApp.sendMessage(content);
        }

    } catch (error) {
        console.error('Erro ao retransmitir mensagem:', error);
    }
});

// Debug de mensagens recebidas no WhatsApp
wppClient.on('message', msg => {
    console.log(`Mensagem recebida de: ${msg.from}`);
});

// Inicializa os bots
discordClient.login(process.env.DISCORD_TOKEN);
wppClient.initialize();
