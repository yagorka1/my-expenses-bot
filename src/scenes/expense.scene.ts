import axios from 'axios';
import { Markup, Scenes } from 'telegraf';
import { Currencies } from '../constants/currencies';
import { Persons } from '../constants/persons';
import { Actions } from '../enum/actions';
import { BotContext } from '../interfaces/context.interface';
import Category from '../models/Category';
import Subcategory from '../models/Subcategory';
import { formatDate } from '../utils/date.utils';

export const EXPENSE_SCENE_ID = 'EXPENSE_WIZARD';

// Helper to safely get text
const getText = (ctx: any): string | undefined => {
    return ctx.message?.text;
};

export const expenseWizard = new Scenes.WizardScene<BotContext>(
  EXPENSE_SCENE_ID,
  // Step 1: Amount
  async (ctx) => {
    if (!ctx.session) ctx.session = {} as any;
    ctx.session.expense = {};
    await ctx.reply('Введи сумму:', Markup.removeKeyboard());
    return ctx.wizard.next();
  },
  // Step 2: Currency
  async (ctx) => {
    const text = getText(ctx);
    if (!text) return; // Should probably prompt user?

    const amount = parseFloat(text);
    if (isNaN(amount)) {
      await ctx.reply('Введите корректную сумму.');
      return; 
    }
    
    if (!ctx.session.expense) ctx.session.expense = {};
    ctx.session.expense.amount = amount;
    
    await ctx.reply('Выбери валюту:', Markup.keyboard(Currencies.map(c => [c])).oneTime().resize());
    return ctx.wizard.next();
  },
  // Step 3: Category
  async (ctx) => {
    const currency = getText(ctx);
    if (!currency || !Currencies.includes(currency)) {
        await ctx.reply('Пожалуйста, выберите валюту из списка.');
        return;
    }
    ctx.session.expense.currency = currency;

    try {
        const categories = await Category.find().exec();
        if (categories.length === 0) {
            await ctx.reply('Нет доступных категорий.');
            return ctx.scene.leave();
        }
        await ctx.reply('Выбери категорию:', Markup.keyboard(categories.map(c => [c.name])).oneTime().resize());
        return ctx.wizard.next();
    } catch (e) {
        console.error(e);
        await ctx.reply('Ошибка при получении категорий.');
        return ctx.scene.leave();
    }
  },
  // Step 4: Subcategory
  async (ctx) => {
    const categoryName = getText(ctx);
    if (!categoryName) return;

    const category = await Category.findOne({ name: categoryName });
    
    if (!category) {
        await ctx.reply('Категория не найдена. Попробуйте еще раз.');
        return;
    }
    ctx.session.expense.categoryName = categoryName;
    ctx.session.expense.category = {
        _id: category._id.toString(),
        name: category.name
    };

    try {
        const subcategories = await Subcategory.find({ categoryId: category._id }).exec();
        if (subcategories.length === 0) {
            await ctx.reply('Нет доступных подкатегорий.');
             return ctx.scene.leave();
        }
        
        (ctx.wizard.state as any).subcategories = subcategories;

        await ctx.reply('Выбери подкатегорию:', Markup.keyboard(subcategories.map(c => [c.name])).oneTime().resize());
        return ctx.wizard.next();
    } catch (e) {
        console.error(e);
        await ctx.reply('Ошибка получения подкатегорий');
        return ctx.scene.leave();
    }
  },
  // Step 5: Date
  async (ctx) => {
    const subcategoryName = getText(ctx);
    if (!subcategoryName) return;

    const subcategories = (ctx.wizard.state as any).subcategories || [];
    const subcategory = subcategories.find((s: any) => s.name === subcategoryName);

    if (!subcategory) {
        await ctx.reply('Подкатегория не найдена.');
        return;
    }
    ctx.session.expense.subcategoryName = subcategoryName;
    ctx.session.expense.subcategory = {
        _id: subcategory._id.toString(),
        name: subcategory.name
    };

    await ctx.reply('Выберите дату:', Markup.inlineKeyboard([
        [Markup.button.callback('Сегодня', Actions.SetTodayDate)],
        [Markup.button.callback('Вчера', Actions.SetYesterdayDate)],
        [Markup.button.callback('Выбрать дату', Actions.ChooseDate)],
    ]));
    return ctx.wizard.next();
  },
  // Step 6: Handle Date Action/Input
  async (ctx) => {
    // This step handles both CallbackQuery (buttons) and Text (custom date)
    // If it's a callback query:
    if (ctx.callbackQuery) {
        // @ts-ignore
        const data = ctx.callbackQuery.data;
        const date = new Date();
        
        if (data === Actions.SetTodayDate) {
            ctx.session.expense.date = date;
        } else if (data === Actions.SetYesterdayDate) {
            date.setDate(date.getDate() - 1);
            ctx.session.expense.date = date;
        } else if (data === Actions.ChooseDate) {
             await ctx.reply('Введите дату в формате ДД.ММ.ГГГГ:');
             return; // Stay in this step to wait for text input
        }
        
        // If we set a date, move to next step
        if (data !== Actions.ChooseDate) {
            await ctx.answerCbQuery();
            await ctx.reply(`Дата: ${formatDate(ctx.session.expense.date)}`);
            await ctx.reply('Кто потратил?', Markup.keyboard(Persons.map(p => [p])).oneTime().resize());
            return ctx.wizard.next();
        }
    } 
    else {
        const text = getText(ctx);
        if (text) {
            const parts = text.split('.');
            if (parts.length === 3) {
                 const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                 if (!isNaN(date.getTime())) {
                     ctx.session.expense.date = date;
                     await ctx.reply(`Дата: ${formatDate(date)}`);
                     await ctx.reply('Кто потратил?', Markup.keyboard(Persons.map(p => [p])).oneTime().resize());
                     return ctx.wizard.next();
                 }
            }
            await ctx.reply('Неверный формат. ДД.ММ.ГГГГ');
        }
    }
  },
  // Step 7: Person
  async (ctx) => {
    const person = getText(ctx);
    if (!person || !Persons.includes(person)) {
        await ctx.reply('Выберите из списка.');
        return;
    }
    ctx.session.expense.person = person;

    await ctx.reply('Введите описание:', Markup.inlineKeyboard([
        [Markup.button.callback('Пропустить', Actions.EnterDescription)] 
    ]));
    return ctx.wizard.next();
  },
  // Step 8: Description
  async (ctx) => {
    let description = '';
    if (ctx.callbackQuery) {
        // Skipped
        await ctx.answerCbQuery();
        description = '';
    } else {
        description = getText(ctx) || '';
    }
    ctx.session.expense.description = description;

    const e = ctx.session.expense;
    const message = `
Подтвердите вашу трату:
Сумма: ${e.amount} ${e.currency}
Категория: ${e.categoryName}
Подкатегория: ${e.subcategoryName}
Кто: ${e.person}
Дата: ${formatDate(e.date)}
Описание: ${e.description || '-'}`;

    await ctx.reply(message, Markup.inlineKeyboard([
        [Markup.button.callback('Подтвердить', Actions.Confirm)],
        [Markup.button.callback('Отмена', Actions.Cancel)]
    ]));
    return ctx.wizard.next();
  },
  // Step 9: Final Confirmation
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    // @ts-ignore
    const action = ctx.callbackQuery.data;

    if (action === Actions.Confirm) {
        const e = ctx.session.expense;
        const apiUrl = process.env.IS_LOCAL === 'true' ? 'http://localhost:3000' : process.env.API_URL;
        
        try {
            await axios.post(`${apiUrl}/expenses/create`, {
                amount: e.amount,
                currency: e.currency,
                categoryName: e.categoryName,
                categoryId: e.category?._id || null,
                subcategoryName: e.subcategoryName,
                subcategoryId: e.subcategory?._id || null,
                person: e.person,
                date: e.date,
                description: e.description
            }, {
                headers: { Authorization: `Bearer ${process.env.BOT_TOKEN}` }
            });
            await ctx.reply('✅ Трата успешно сохранена!!!', Markup.removeKeyboard());
        } catch (err) {
            console.error(err);
            await ctx.reply('❌ Ошибка сохранения.');
        }
    } else {
        await ctx.reply('❌ Отменено.', Markup.removeKeyboard());
    }
    
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }
);
