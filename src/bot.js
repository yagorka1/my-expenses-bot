require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Expense = require('./models/Expense');
const ExcelJS = require('exceljs');
const { Steps } = require('./enum/steps');
const { Currencies } = require("./constants/currencies");
const { Categories } = require("./constants/categories");
const { Persons } = require("./constants/persons");
const { InlineKeyboardButton, InlineKeyboardMarkup } = require('node-telegram-bot-api');
const express = require('express');

const port = process.env.PORT || 4000;

const app = express();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });


app.get('/', (req, res) => {
    res.send('works');
});


const domain = 'https://my-expenses-bot-vsp1.onrender.com';


bot.setWebHook(`${domain}/bot${process.env.BOT_TOKEN}`);


app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


app.listen(port, () => {
    console.log(`Сервер слушает на порту ${port}`);
});

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected...'))
    .catch(err => console.log(err));

const userState = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Привет! 👋');
    showMainMenu(msg.chat.id);
});

bot.onText(/➕ Добавить трату/, (msg) => {
    userState[msg.chat.id] = {};
    bot.sendMessage(msg.chat.id, 'Введи сумму:');
    userState[msg.chat.id].step = Steps.Amount;
});

bot.onText(/📊 Скачать отчет/, async (msg) => {
    const chatId = msg.chat.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const expenses = await Expense.find({ date: { $gte: startOfMonth } });

    if (!expenses.length) {
        return bot.sendMessage(chatId, 'За этот месяц трат не найдено.');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Отчет');

    sheet.columns = [
        { header: 'Сумма', key: 'amount' },
        { header: 'Валюта', key: 'currency' },
        { header: 'Категория', key: 'category' },
        { header: 'Кто', key: 'person' },
        { header: 'Дата', key: 'date' },
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

    return bot.sendDocument(chatId, buffer, {}, {
        filename: 'report.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
});

bot.onText(/\/add/, (msg) => {
    userState[msg.chat.id] = {};
    bot.sendMessage(msg.chat.id, 'Введи сумму:');
    userState[msg.chat.id].step = 'amount';
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userState[chatId];
    if (!state) return;

    switch (state.step) {
        case Steps.Amount:
            const amount = parseFloat(text);
            if (isNaN(amount)) return bot.sendMessage(chatId, 'Введите корректную сумму.');

            state.amount = amount;
            state.step = Steps.Currency;
            return bot.sendMessage(chatId, 'Выбери валюту:', {
                reply_markup: { keyboard: Currencies.map(c => [c]), one_time_keyboard: true },
            });

        case Steps.Currency:
            state.currency = text;
            state.step = Steps.Category;
            return bot.sendMessage(chatId, 'Выбери категорию:', {
                reply_markup: { keyboard: Categories.map(c => [c]), one_time_keyboard: true },
            });

        case Steps.Category:
            state.category = text;

            state.step = Steps.Date;
            return bot.sendMessage(chatId, `Выберите дату:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Сегодня', callback_data: 'today' }],
                        [{ text: 'Вчера', callback_data: 'yesterday' }],
                        [{ text: 'Выбрать дату', callback_data: 'choose_date' }],
                    ],
                },
            });

        case Steps.Date:
            const inputDate = text.trim();
            let parsedDate;

            if (inputDate === '' || inputDate.toLowerCase() === 'сегодня') {
                parsedDate = new Date();
            } else {
                const [day, month, year] = inputDate.split('.');
                parsedDate = new Date(`${year}-${month}-${day}`);
            }

            if (isNaN(parsedDate)) {
                return bot.sendMessage(chatId, 'Введите дату в формате ДД.ММ.ГГГГ или оставьте пустым для сегодняшней:');
            }

            state.date = parsedDate;
            state.step = Steps.Person;

            return bot.sendMessage(chatId, 'Кто потратил?', {
                reply_markup: { keyboard: Persons.map(p => [p]), one_time_keyboard: true },
            });

        case Steps.Person:
            state.person = text;

            const confirmationMessage = `
                Подтвердите вашу трату:
                Сумма: ${state.amount} ${state.currency}
                Категория: ${state.category}
                Кто: ${state.person}
                Дата: ${formatDate(state.date)}
            `;

            state.step = Steps.Confirmation;
            return bot.sendMessage(chatId, confirmationMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подтвердить', callback_data: 'confirm' }],
                        [{ text: 'Отмена', callback_data: 'cancel' }],
                    ],
                },
            });
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    console.log(action);
    console.log(userState);
    console.log(userState[chatId]);

    if(!userState[chatId]) {
        return
    }


    if (action === 'confirm') {
        const state = userState[chatId];
        console.log(state);
        await Expense.create({
            amount: state.amount,
            category: state.category,
            currency: state.currency,
            person: state.person,
            date: state.date || new Date(),
        });

        delete userState[chatId];

        // Очистка сообщений и подтверждение
        bot.sendMessage(chatId, '✅ Трата успешно сохранена!');
        showMainMenu(chatId);
    }

    if (action === 'cancel') {
        delete userState[chatId];

        // Очистка сообщений и отмена
        bot.sendMessage(chatId, '❌ Вы отменили запись.');
        showMainMenu(chatId);
    }

    if (action === 'today') {
        const todayDate = new Date();
        userState[chatId].date = todayDate;
        bot.sendMessage(chatId, `Дата установлена на: ${formatDate(todayDate)}`);
        userState[chatId].step = Steps.Person;
        return bot.sendMessage(chatId, 'Кто потратил?', {
            reply_markup: { keyboard: Persons.map(p => [p]), one_time_keyboard: true },
        });
    }

    if (action === 'yesterday') {
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        userState[chatId].date = yesterdayDate;
        bot.sendMessage(chatId, `Дата установлена на: ${formatDate(yesterdayDate)}`);
        userState[chatId].step = Steps.Person;
        return bot.sendMessage(chatId, 'Кто потратил?', {
            reply_markup: { keyboard: Persons.map(p => [p]), one_time_keyboard: true },
        });
    }

    if (action === 'choose_date') {
        userState[chatId].step = Steps.Date;
        return bot.sendMessage(chatId, 'Введите дату в формате ДД.ММ.ГГГГ или отправьте "сегодня":');
    }
});

function showMainMenu(chatId) {
    bot.sendMessage(chatId, 'Выберите действие:', {
        reply_markup: {
            keyboard: [
                ['➕ Добавить трату'],
                ['📊 Скачать отчет'],
            ],
            resize_keyboard: true,
        },
    });
}
