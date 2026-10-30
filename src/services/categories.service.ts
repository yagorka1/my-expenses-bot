import { COLLECTIONS } from '../constants/firestore';
import { getDb } from '../config/firebase';
import {
  CategoryDocument,
  CategoryItem,
  ExpenseDocument,
  SubcategoryDocument,
  SubcategoryItem,
} from '../interfaces/firestore.interface';

/** Shown for an expense whose category is gone and that has no stored name either. */
export const UNKNOWN_CATEGORY_NAME = 'Без категории';

/** Current names of an expense's category and subcategory, looked up by id. */
export interface CategoryNames {
  category(expense: ExpenseDocument): string;
  subcategory(expense: ExpenseDocument): string;
}

export async function getCategories(): Promise<CategoryItem[]> {
  const snapshot = await getDb().collection(COLLECTIONS.categories).orderBy('name').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as CategoryDocument) }));
}

export async function getSubcategories(categoryId: string): Promise<SubcategoryItem[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.subcategories)
    .where('categoryId', '==', categoryId)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as SubcategoryDocument) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Old expenses whose ids couldn't be matched fall back to the name they were saved with. */
export async function getCategoryNames(): Promise<CategoryNames> {
  const db = getDb();
  const [categories, subcategories] = await Promise.all([
    db.collection(COLLECTIONS.categories).get(),
    db.collection(COLLECTIONS.subcategories).get(),
  ]);
  const categoryNames = new Map(categories.docs.map((doc) => [doc.id, (doc.data() as CategoryDocument).name]));
  const subcategoryNames = new Map(subcategories.docs.map((doc) => [doc.id, (doc.data() as SubcategoryDocument).name]));

  return {
    category: (expense) => categoryNames.get(expense.categoryId) || expense.categoryName || UNKNOWN_CATEGORY_NAME,
    subcategory: (expense) =>
      subcategoryNames.get(expense.subcategoryId) || expense.subcategoryName || UNKNOWN_CATEGORY_NAME,
  };
}
