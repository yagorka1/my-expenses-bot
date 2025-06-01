import axios from 'axios';
import { ReportsInterface } from '../interfaces/reports.interface';
import { Telegraf } from 'telegraf';

export async function sendWeeklyMonthlyReport(bot: Telegraf, type: string) {
  try {
    const apiUrl: string | undefined = process.env.IS_LOCAL ? 'http://localhost:3000' : process.env.API_URL;
    if (!apiUrl) throw new Error('API URL is not defined');

    const response = await axios.get(`${apiUrl}/expenses/statistics?type=${type}`, {
      headers: {
        Authorization: `Bearer ${process.env.BOT_TOKEN}`,
      },
    });

    const data: ReportsInterface = response.data.data as ReportsInterface;

    let result: string = '';
    for (const person in data.expensesByPerson) {
      // @ts-ignore
      const { EUR, RSD } = data.expensesByPerson[person];
      result += `    Траты(${person}): ${EUR.toFixed(2)} EUR | ${RSD.toFixed(2)} RSD | ${(EUR / data.totalAmountInEUR * 100).toFixed(2)}%\n`;
    }

    const difference = data.totalAmountInEUR - data.prevTotalAmountInEUR;
    const percentageChange = ((difference) / data.prevTotalAmountInEUR) * 100;
    const changeDirection = percentageChange > 0 ? '⬆️ Рост' : percentageChange < 0 ? '⬇️ Снижение' : 'Без изменений';

    const message: string = `
Статистика за ${type === 'week' ? 'неделю' : 'месяц'}:

  Траты: ${data.totalAmountInEUR.toFixed(2)} EUR | ${data.totalAmountInRSD.toFixed(2)} RSD | ${(data.totalAmountInEUR / data.totalAmountInEUR * 100).toFixed(2)}%
  По сравнению с прошлой ${type === 'week' ? 'неделей' : 'месяцем'}: ${changeDirection} ${Math.abs(percentageChange).toFixed(2)}%
-------------------------

${result}
-------------------------

${data.sortedExpensesByCategory.map((item) =>
      `  Категория: ${item.category}
    Траты: ${item.amounts.EUR.toFixed(2)} EUR | ${item.amounts.RSD.toFixed(2)} RSD | ${(item.amounts.EUR / data.totalAmountInEUR * 100).toFixed(2)}%
`).join('\n')}
-------------------------

${data.sortedExpensesBySubcategory.map((item) =>
      `  Подкатегория: ${item.subcategory}
    Траты: ${item.amounts.EUR.toFixed(2)} EUR | ${item.amounts.RSD.toFixed(2)} RSD | ${(item.amounts.EUR / data.totalAmountInEUR * 100).toFixed(2)}%
`).join('\n')}
`;

    const chatId  = (process.env.ALLOWED_USERS || '')

    await bot.telegram.sendMessage(chatId, message);
    console.log('Message sent');
  } catch (err) {
    console.error('Error sending message:', err);
  }
}
