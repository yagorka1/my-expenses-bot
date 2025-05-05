require('dotenv').config();
const {Telegraf} = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Expense = require('./models/Expense');
const {Steps} = require('./enum/steps');
const {Currencies} = require("./constants/currencies");
const {Categories} = require("./constants/categories");
const {Persons} = require("./constants/persons");

const port = process.env.PORT || 4000;
const isLocal = process.env.IS_LOCAL === 'true';
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected...'))
    .catch(err => console.log(err));

app.use(express.json());

if (!isLocal) {
    const domain = 'https://my-expense-bot.glitch.me';
    bot.telegram.setWebhook(`${domain}/bot${process.env.BOT_TOKEN}`);

    app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
        bot.handleUpdate(req.body);
        res.sendStatus(200);
    });
} else {
    bot.launch();
    console.log('Бот запущен в режиме polling (локально)');
}

app.get('/', (req, res) => res.send('works'));
app.listen(port, () => console.log(`Сервер слушает на порту ${port}`));

const userState = {};

const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

function showMainMenu(ctx) {
    ctx.reply('Выберите действие:', {
        reply_markup: {
            keyboard: [
                ['➕ Добавить трату'],
                ['📊 Скачать отчет'],
            ],
            resize_keyboard: true,
        },
    });
}

bot.start((ctx) => {
    ctx.reply('Привет! 👋');
    showMainMenu(ctx);
});

bot.hears('➕ Добавить трату', (ctx) => {
    userState[ctx.chat.id] = {step: Steps.Amount};
    ctx.reply('Введи сумму:');
});

bot.hears('📊 Скачать отчет', async (ctx) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const expenses = await Expense.find({date: {$gte: startOfMonth}});

    if (!expenses.length) return ctx.reply('За этот месяц трат не найдено.');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Отчет');

    sheet.columns = [
        {header: 'Сумма', key: 'amount'},
        {header: 'Валюта', key: 'currency'},
        {header: 'Категория', key: 'category'},
        {header: 'Кто', key: 'person'},
        {header: 'Дата', key: 'date'},
    ];

    expenses.forEach(e => {
        sheet.addRow({
            amount: e.amount,
            currency: e.currency,
            category: e.category,
            person: e.person,
            date: e.date.toISOString().split('T')[0],
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    await ctx.replyWithDocument({source: buffer, filename: 'report.xlsx'});
});

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const state = userState[chatId];

    if (!state) return;

    switch (state.step) {
        case Steps.Amount: {
            const amount = parseFloat(text);
            if (isNaN(amount)) return ctx.reply('Введите корректную сумму.');
            state.amount = amount;
            state.step = Steps.Currency;
            return ctx.reply('Выбери валюту:', {
                reply_markup: {
                    keyboard: Currencies.map(c => [c]),
                    one_time_keyboard: true,
                },
            });
        }

        case Steps.Currency:
            state.currency = text;
            state.step = Steps.Category;
            return ctx.reply('Выбери категорию:', {
                reply_markup: {
                    keyboard: Categories.map(c => [c]),
                    one_time_keyboard: true,
                },
            });

        case Steps.Category:
            state.category = text;
            state.step = Steps.Date;
            return ctx.reply('Выберите дату:', {
                reply_markup: {
                    inline_keyboard: [
                        [{text: 'Сегодня', callback_data: 'today'}],
                        [{text: 'Вчера', callback_data: 'yesterday'}],
                        [{text: 'Выбрать дату', callback_data: 'choose_date'}],
                    ],
                },
            });

        case Steps.Date:
            let inputDate = text.trim();
            let parsedDate;

            if (inputDate === '' || inputDate.toLowerCase() === 'сегодня') {
                parsedDate = new Date();
            } else {
                const [day, month, year] = inputDate.split('.');
                parsedDate = new Date(`${year}-${month}-${day}`);
            }

            if (isNaN(parsedDate)) {
                return ctx.reply('Введите дату в формате ДД.ММ.ГГГГ или оставьте пустым для сегодняшней:');
            }

            state.date = parsedDate;
            state.step = Steps.Person;
            return ctx.reply('Кто потратил?', {
                reply_markup: {
                    keyboard: Persons.map(p => [p]),
                    one_time_keyboard: true,
                },
            });

        case Steps.Person:
            state.person = text;

            const message = `
Подтвердите вашу трату:
Сумма: ${state.amount} ${state.currency}
Категория: ${state.category}
Кто: ${state.person}
Дата: ${formatDate(state.date)}
      `;

            state.step = Steps.Confirmation;
            return ctx.reply(message, {
                reply_markup: {
                    inline_keyboard: [
                        [{text: 'Подтвердить', callback_data: 'confirm'}],
                        [{text: 'Отмена', callback_data: 'cancel'}],
                    ],
                },
            });
    }
});

bot.on('callback_query', async (ctx) => {
    const chatId = ctx.chat.id;
    const action = ctx.callbackQuery.data;

    if (!userState[chatId]) return;

    const state = userState[chatId];

    if (action === 'confirm') {
        await Expense.create({
            amount: state.amount,
            currency: state.currency,
            category: state.category,
            person: state.person,
            date: state.date || new Date(),
        });

        delete userState[chatId];
        await ctx.reply('✅ Трата успешно сохранена!!!');
        showMainMenu(ctx);
    }

    if (action === 'cancel') {
        delete userState[chatId];
        await ctx.reply('❌ Вы отменили запись.');
        showMainMenu(ctx);
    }

    if (action === 'today') {
        const date = new Date();
        state.date = date;
        state.step = Steps.Person;
        await ctx.reply(`Дата установлена на: ${formatDate(date)}`);
        return ctx.reply('Кто потратил?', {
            reply_markup: {keyboard: Persons.map(p => [p]), one_time_keyboard: true},
        });
    }

    if (action === 'yesterday') {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        state.date = date;
        state.step = Steps.Person;
        await ctx.reply(`Дата установлена на: ${formatDate(date)}`);
        return ctx.reply('Кто потратил?', {
            reply_markup: {keyboard: Persons.map(p => [p]), one_time_keyboard: true},
        });
    }

    if (action === 'choose_date') {
        state.step = Steps.Date;
        return ctx.reply('Введите дату в формате ДД.ММ.ГГГГ или отправьте "сегодня":');
    }
});
