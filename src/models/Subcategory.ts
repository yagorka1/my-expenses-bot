import { Schema, model } from 'mongoose';

const subcategorySchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
});

const Subcategory = model('subcategories', subcategorySchema);

export default Subcategory;
