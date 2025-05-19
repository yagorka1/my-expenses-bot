import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { afternoonMessages, eveningMessages } from '../constants/notification-messages';

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
}
