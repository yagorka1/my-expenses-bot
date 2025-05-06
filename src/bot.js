require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const { createBotLogic } = require('./botLogic');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const port = process.env.PORT || 4000;
const isLocal = process.env.IS_LOCAL === 'true';
const domain = process.env.DOMAIN || 'https://my-expenses-bot-production.up.railway.app';

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected');

        createBotLogic(bot);


        if (isLocal) {
            await bot.launch();
        } else {
            app.use(express.json());
            app.use(bot.webhookCallback(`/bot${process.env.BOT_TOKEN}`));

            await bot.telegram.setWebhook(`${domain}/bot${process.env.BOT_TOKEN}`);
            console.log('🌐 Webhook:', `${domain}/bot${process.env.BOT_TOKEN}`);
        }

        app.get('/', (req, res) => res.send('works'));

        app.listen(port, () => {
            console.log(`🚀 Port ${port}`);
        });

        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (err) {
        console.error('❌ Error:', err);
    }
})();
