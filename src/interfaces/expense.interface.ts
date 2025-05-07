import { Steps } from '../enum/steps';

export interface ExpenseInterface {
  step: Steps;
  amount?: number;
  currency?: string;
  category?: string;
  date?: Date;
  person?: string;
  description?: string;
}
