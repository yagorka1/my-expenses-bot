import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface CategoryDocument {
  name: string;
  description: string;
}

export interface SubcategoryDocument {
  categoryId: string;
  name: string;
  description: string;
  isNecessary: boolean;
}

export interface CategoryItem extends CategoryDocument {
  id: string;
}

export interface SubcategoryItem extends SubcategoryDocument {
  id: string;
}

/** Shape of a document in the `expenses` collection; shared with expenses-mobile. */
export interface ExpenseDocument {
  amount: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  person: string;
  description: string;
  date: Timestamp;
  amounts: Record<string, number>;
  source: string;
  createdBy: string;
  createdAt: Timestamp | FieldValue;
}

export interface NewExpense {
  amount: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  person: string;
  description: string;
  date: Date;
}
