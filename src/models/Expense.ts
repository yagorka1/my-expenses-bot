import { Schema, model, Document, Types } from 'mongoose';

interface IExpense extends Document {
    amount: number;
    currency: string;
    categoryName: string;
    categoryId: Types.ObjectId;
    subcategoryId: Types.ObjectId;
    subcategoryName: string;
    person: string;
    date: Date;
}

const expenseSchema = new Schema<IExpense>({
    amount: Number,
    currency: String,
    categoryName: String,
    categoryId: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
    },
    subcategoryId: {
        type: Schema.Types.ObjectId,
        ref: 'Subcategory',
        required: true,
    },
    subcategoryName: String,
    person: String,
    date: Date,
});

export default model<IExpense>('Expense', expenseSchema);
