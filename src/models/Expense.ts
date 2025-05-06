import { Schema, model, Document } from 'mongoose';

interface IExpense extends Document {
    amount: number;
    currency: string;
    category: string;
    person: string;
    date: Date;
}

const expenseSchema = new Schema<IExpense>({
    amount: Number,
    currency: String,
    category: String,
    person: String,
    date: Date,
});

export default model<IExpense>('Expense', expenseSchema);
