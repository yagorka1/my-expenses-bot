import { Schema, model } from 'mongoose';

const categorySchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
});

const Category = model('categories', categorySchema);

export default Category;
