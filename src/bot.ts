import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import express, { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Markup, Scenes, session, Telegraf } from 'telegraf';
import { BotContext } from './interfaces/context.interface';
import Expense from './models/Expense';
import { EXPENSE_SCENE_ID, expenseWizard } from './scenes/expense.scene';
import { createAccessControlMiddleware } from './scripts/accessControl';

dotenv.config();
const app: Express = express();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined in environment variables');
}

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);

const port = process.env.PORT || 4000;
const isLocal = process.env.IS_LOCAL === 'true';
const domain = process.env.DOMAIN;

// Middleware
bot.use(session());
bot.use(createAccessControlMiddleware());

// @ts-ignore
const stage = new Scenes.Stage<BotContext>([expenseWizard]);
bot.use(stage.middleware());

// Menu Wrapper
const showMainMenu = (ctx: BotContext) => {
    ctx.reply('Выберите действие:', Markup.keyboard([['➕ Добавить трату'], ['📊 Скачать отчет']]).resize());
};

bot.start((ctx) => {
  ctx.reply('Привет! 👋');
  showMainMenu(ctx);
});

bot.hears('➕ Добавить трату', (ctx) => ctx.scene.enter(EXPENSE_SCENE_ID));

bot.hears('📊 Скачать отчет', async (ctx) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const expenses = await Expense.find({ date: { $gte: startOfMonth } });

      if (!expenses.length) return ctx.reply('За этот месяц трат не найдено.');

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Отчет');

      sheet.columns = [
        { header: 'Сумма', key: 'amount' },
        { header: 'Валюта', key: 'currency' },
        { header: 'Категория', key: 'categoryName' },
        { header: 'Подкатегория', key: 'subcategoryName' },
        { header: 'Кто', key: 'person' },
        { header: 'Дата', key: 'date' },
      ];

      expenses.forEach(e =>
        sheet.addRow({
          amount: e.amount,
          currency: e.currency,
          categoryName: e.categoryName,
          subcategoryName: e.subcategoryName,
          person: e.person,
          date: e.date.toISOString().split('T')[0],
        })
      );

      const buffer = await workbook.xlsx.writeBuffer();
      // @ts-ignore
      await ctx.replyWithDocument({ source: buffer, filename: 'report.xlsx' });
    } catch (err) {
      console.error(err);
      ctx.reply('Ошибка при формировании отчета.');
    }
});

(async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    require('./scripts/scheduleMessages').setupDailyScheduler(bot);

    if (isLocal) {

      await bot.launch();
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
    console.error('❌ Startup error:', err instanceof Error ? err.message : err);
    console.error(err);
  }
})();
