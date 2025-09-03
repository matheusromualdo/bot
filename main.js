// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { Client: WppClient, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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

const wppClient = new WppClient({
    authStrategy: new LocalAuth()
});

wppClient.on('qr', qr => qrcode.generate(qr, { small: true }));
wppClient.on('authenticated', () => console.log('✅ Autenticado com sucesso!'));
wppClient.on('auth_failure', msg => console.error('❌ Falha de autenticação:', msg));
wppClient.on('ready', () => console.log('📱 WhatsApp pronto!'));
wppClient.on('disconnected', reason => console.error('⚠️ Desconectado:', reason));

discordClient.on('messageCreate', async message => {
    // Ignora bots e canais que não interessam
    if (message.author.bot || message.channelId !== process.env.DISCORD_CHANNEL_ORIGEM) return;

    try {
        const chatWhatsApp = await wppClient.getChatById(process.env.WHATSAPP_CHAT_DESTINO);
        const discordChannelDestino = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_DESTINO);

        // Envia anexos se existirem
        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const media = await MessageMedia.fromUrl(attachment.url);

                // Envia para WhatsApp
                await chatWhatsApp.sendMessage(media, { caption: message.content || '' });

                // Envia para outro canal do Discord
                await discordChannelDestino.send({
                    content: message.content || '',
                    files: [attachment.url]
                });
            }
        } else {
            // Apenas texto
            if (message.content) {
                await chatWhatsApp.sendMessage(message.content);
                await discordChannelDestino.send(message.content);
            }
        }
    } catch (error) {
        console.error('Erro ao retransmitir mensagem:', error);
    }
});


wppClient.on('message', async msg => {
    // Só processa mensagens de um grupo específico
    if (msg.from !== process.env.WHATSAPP_CHAT_ORIGEM) return;

    try {
        const discordChannel = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_DESTINO);
        const chatWhatsApp = await wppClient.getChatById(process.env.WHATSAPP_CHAT_DESTINO);
        const content = msg.body || '';

        // Envia para o Discord
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
        } else {
            await discordChannel.send(content);
        }

        // Envia para outro chat do WhatsApp
        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            await chatWhatsApp.sendMessage(media, { caption: content });
        } else {
            await chatWhatsApp.sendMessage(content);
        }

    } catch (error) {
        console.error('Erro ao retransmitir mensagem:', error);
    }
});

wppClient.on('message', msg => {
    console.log(`Mensagem recebida de: ${msg.from}`);
});

discordClient.login(process.env.DISCORD_TOKEN);
wppClient.initialize();