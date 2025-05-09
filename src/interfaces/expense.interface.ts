import { Steps } from '../enum/steps';

export interface ExpenseInterface {
  step: Steps;
  amount?: number;
  currency?: string;
  categoryName?: string;
  category?: {
    _id: string;
    name: string;
  },
  subcategoryName?: string;
  subcategory?: {
    _id: string;
    name: string;
  },
  date?: Date;
  person?: string;
  description?: string;
  categories?: [];
  subcategories?: [];
}
