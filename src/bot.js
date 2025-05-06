require('dotenv').config();

const express = require('express');
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const app = express();
const { createBotLogic } = require('./botLogic');

const bot = new Telegraf(process.env.BOT_TOKEN);

const port = process.env.PORT || 4000;
const isLocal = process.env.IS_LOCAL === 'true';
const domain = process.env.DOMAIN || 'https://my-expenses-bot-production.up.railway.app';

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected');

        require('./botLogic.js').createBotLogic(bot);

        if (isLocal) {
            await bot.launch();
            console.log('🚀 Bot running in polling mode');
        } else {
            app.use(express.json());
            app.use(bot.webhookCallback(`/bot${process.env.BOT_TOKEN}`));
            await bot.telegram.setWebhook(`${domain}/bot${process.env.BOT_TOKEN}`);
            console.log(`🌐 Webhook set to: ${domain}/bot${process.env.BOT_TOKEN}`);
        }

        app.get('/', (req, res) => res.send('Bot is up and running'));

        app.listen(port, () => {
            console.log(`🚀 Server listening on port ${port}`);
        });

        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (err) {
        console.error('❌ Startup error:', err);
    }
})();
