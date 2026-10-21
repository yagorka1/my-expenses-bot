import { Telegraf } from 'telegraf';
import { getStatistics, StatisticsType } from '../services/statistics.service';

/** Share of `part` in `total` as "12.34%"; "0.00%" when the total is zero. */
const percent = (part: number, total: number) => `${(total > 0 ? (part / total) * 100 : 0).toFixed(2)}%`;

export async function sendWeeklyMonthlyReport(bot: Telegraf, type: StatisticsType) {
  try {
    const data = await getStatistics(type);

    let result: string = '';
    for (const person in data.expensesByPerson) {
      const { EUR, RSD } = data.expensesByPerson[person];
      result += `    Траты(${person}): ${EUR.toFixed(2)} EUR | ${RSD.toFixed(2)} RSD | ${percent(EUR, data.totalAmountInEUR)}\n`;
    }

    const difference = data.totalAmountInEUR - data.prevTotalAmountInEUR;
    const comparison = data.prevTotalAmountInEUR > 0
      ? (() => {
          const percentageChange = (difference / data.prevTotalAmountInEUR) * 100;
          const changeDirection = percentageChange > 0 ? '⬆️ Рост' : percentageChange < 0 ? '⬇️ Снижение' : 'Без изменений';
          return `${changeDirection} ${Math.abs(percentageChange).toFixed(2)}%`;
        })()
      : 'нет данных за прошлый период';

    const message: string = `
Статистика за ${type === 'week' ? 'неделю' : 'месяц'}:

  Траты: ${data.totalAmountInEUR.toFixed(2)} EUR | ${data.totalAmountInRSD.toFixed(2)} RSD
  По сравнению с прошлой ${type === 'week' ? 'неделей' : 'месяцем'}: ${comparison}
-------------------------

${result}
-------------------------

${data.sortedExpensesByCategory.map((item) =>
      `  Категория: ${item.category}
    Траты: ${item.amounts.EUR.toFixed(2)} EUR | ${item.amounts.RSD.toFixed(2)} RSD | ${percent(item.amounts.EUR, data.totalAmountInEUR)}
`).join('\n')}
-------------------------

${data.sortedExpensesBySubcategory.map((item) =>
      `  Подкатегория: ${item.subcategory}
    Траты: ${item.amounts.EUR.toFixed(2)} EUR | ${item.amounts.RSD.toFixed(2)} RSD | ${percent(item.amounts.EUR, data.totalAmountInEUR)}
`).join('\n')}
`;

    const chatIds: Array<string> = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim()).filter(Boolean);

    for (const chatId of chatIds) {
      await bot.telegram.sendMessage(chatId, message);
    }
    console.log('Message sent');
  } catch (err) {
    console.error('Error sending message:', err);
  }
}
