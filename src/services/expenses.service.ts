import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, EXPENSE_SOURCES, SYSTEM_AUTHORS } from '../constants/firestore';
import { getDb } from '../config/firebase';
import { ExpenseDocument, NewExpense } from '../interfaces/firestore.interface';
import { convertToAllCurrencies, getEurRates } from './exchange-rates.service';

export async function createExpense(expense: NewExpense): Promise<string> {
  const eurRates = await getEurRates();
  const document: ExpenseDocument = {
    ...expense,
    date: Timestamp.fromDate(expense.date),
    amounts: convertToAllCurrencies(expense.amount, expense.currency, eurRates),
    source: EXPENSE_SOURCES.bot,
    createdBy: SYSTEM_AUTHORS.bot,
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = await getDb().collection(COLLECTIONS.expenses).add(document);
  return ref.id;
}

/** Expenses with `from <= date <= to` (both optional ends inclusive), oldest first. */
export async function getExpensesInRange(from: Date, to?: Date): Promise<ExpenseDocument[]> {
  let query = getDb()
    .collection(COLLECTIONS.expenses)
    .where('date', '>=', Timestamp.fromDate(from));

  if (to) {
    query = query.where('date', '<=', Timestamp.fromDate(to));
  }

  const snapshot = await query.orderBy('date').get();
  return snapshot.docs.map((doc) => doc.data() as ExpenseDocument);
}
