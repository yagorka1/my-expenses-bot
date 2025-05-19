import mongoose from 'mongoose';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import { createAccessControlMiddleware } from './scripts/accessControl';
import { setupDailyScheduler } from './scripts/scheduleMessages';

dotenv.config();
const app: Express = express();

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not defined in environment variables');
}

const bot: Telegraf = new Telegraf(process.env.BOT_TOKEN);

const port = process.env.PORT || 4000;
const isLocal = process.env.IS_LOCAL === 'true';
const domain = process.env.DOMAIN;
bot.use(createAccessControlMiddleware());

(async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected');

        require('./scripts/botLogic').createBotLogic(bot);
        require('./scripts/scheduleMessages').setupDailyScheduler(bot);

        if (isLocal) {
            await bot.launch();
            console.log('🚀 Bot running in polling mode');
        } else {
            app.use(express.json());
            app.use(bot.webhookCallback(`/bot${process.env.BOT_TOKEN}`));
            await bot.telegram.setWebhook(`${domain}/bot${process.env.BOT_TOKEN}`);
            console.log(`🌐 Webhook set to: ${domain}/bot${process.env.BOT_TOKEN}`);
        }

        // @ts-ignore
        app.get('/', (req: Request, res: Response) => res.send('Bot is up and running'));

        app.listen(port, () => {
            console.log(`🚀 Server listening on port ${port}`);
        });

        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (err) {
        console.error('❌ Startup error:', err);
    }
})();
