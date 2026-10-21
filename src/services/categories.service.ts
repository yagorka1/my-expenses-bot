import { COLLECTIONS } from '../constants/firestore';
import { getDb } from '../config/firebase';
import { CategoryDocument, CategoryItem, SubcategoryDocument, SubcategoryItem } from '../interfaces/firestore.interface';

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
