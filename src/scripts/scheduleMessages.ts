import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { afternoonMessages, eveningMessages } from '../constants/notification-messages';
import { sendWeeklyMonthlyReport } from './sendWeeklyMonthlyReport';

dotenv.config();

export function setupDailyScheduler(bot: Telegraf) {
  const rawIds = process.env.ALLOWED_USERS;

  if (!rawIds) {
    console.warn('⚠️ RECIPIENT_CHAT_IDS не задан в .env. Пропускаем расписание.');
    return;
  }

  const chatIds = rawIds.split(',').map(id => id.trim()).filter(id => !!id);

  cron.schedule(
    '00 23 * * *',
    async () => {
      const message = eveningMessages[Math.floor(Math.random() * eveningMessages.length)];
      for (const chatId of chatIds) {
        try {
          await bot.telegram.sendMessage(chatId, message);
          console.log(`📬 Вечернее сообщение "${message}" отправлено в ${chatId}`);
        } catch (err) {
          console.error(`❌ Ошибка при отправке вечернего сообщения в ${chatId}:`, err);
        }
      }
    },
    {
      timezone: 'Europe/Warsaw',
    }
  );

  cron.schedule(
    '00 14 * * *',
    async () => {
      const message = afternoonMessages[Math.floor(Math.random() * afternoonMessages.length)];
      for (const chatId of chatIds) {
        try {
          await bot.telegram.sendMessage(chatId, message);
          console.log(`📬 Дневное сообщение "${message}" отправлено в ${chatId}`);
        } catch (err) {
          console.error(`❌ Ошибка при отправке дневного сообщения в ${chatId}:`, err);
        }
      }
    },
    {
      timezone: 'Europe/Warsaw',
    }
  );

  cron.schedule(
    '0 8 1 * *',
    async () => {
      const message = '👋 Не забудь заполнить все траты за прошлый месяц!';
      for (const chatId of chatIds) {
        try {
          await bot.telegram.sendMessage(chatId, message);
          console.log(`📬 Напоминание отправлено в ${chatId}`);
        } catch (err) {
          console.error(`❌ Ошибка при отправке напоминания в ${chatId}:`, err);
        }
      }
    },
    { timezone: 'Europe/Warsaw' }
  );

  cron.schedule('0 13 * * 1', () => {
    (async () => {
      try {
        await sendWeeklyMonthlyReport(bot, 'week');
      } catch (err) {
        console.error('Error in scheduled task:', err);
      }
    })();
  }, {
    timezone: 'Europe/Warsaw',
  });

  cron.schedule('0 17 1 * *', () => {
    (async () => {
      try {
        await sendWeeklyMonthlyReport(bot,'month');
      } catch (err) {
        console.error('Error in scheduled task:', err);
      }
    })();
  }, {
    timezone: 'Europe/Warsaw',
  });
}
