import { ExpenseDocument } from '../interfaces/firestore.interface';
import { ReportAmounts, ReportsInterface } from '../interfaces/reports.interface';
import { getCategoryNames } from './categories.service';
import { getExpensesInRange } from './expenses.service';

export type StatisticsType = 'week' | 'month';

interface Range {
  from: Date;
  to: Date;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/** The last completed week/month and the one before it (same periods expenses-server used). */
function getRanges(type: StatisticsType, now = new Date()): { current: Range; previous: Range } {
  if (type === 'week') {
    const mondayThisWeek = startOfDay(addDays(now, -((now.getDay() + 6) % 7)));
    return {
      current: { from: addDays(mondayThisWeek, -7), to: endOfDay(addDays(mondayThisWeek, -1)) },
      previous: { from: addDays(mondayThisWeek, -14), to: endOfDay(addDays(mondayThisWeek, -8)) },
    };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    current: { from: new Date(year, month - 1, 1), to: endOfDay(new Date(year, month, 0)) },
    previous: { from: new Date(year, month - 2, 1), to: endOfDay(new Date(year, month - 1, 0)) },
  };
}

const amountsOf = (expense: ExpenseDocument): ReportAmounts => ({
  EUR: expense.amounts?.EUR ?? 0,
  RSD: expense.amounts?.RSD ?? 0,
});

function sumBy(expenses: ExpenseDocument[], getKey: (expense: ExpenseDocument) => string) {
  return expenses.reduce<Record<string, ReportAmounts>>((acc, expense) => {
    const key = getKey(expense);
    const { EUR, RSD } = amountsOf(expense);
    acc[key] = { EUR: (acc[key]?.EUR ?? 0) + EUR, RSD: (acc[key]?.RSD ?? 0) + RSD };
    return acc;
  }, {});
}

/**
 * Sums by id and labels each group with its current name, so a renamed category stays one group.
 * An old expense without a known id is grouped by its stored name instead.
 */
function sumByCategory(
  expenses: ExpenseDocument[],
  getId: (expense: ExpenseDocument) => string,
  getName: (expense: ExpenseDocument) => string,
) {
  const names = new Map<string, string>();
  const sums = sumBy(expenses, (expense) => {
    const key = getId(expense) || `name:${getName(expense)}`;
    names.set(key, getName(expense));
    return key;
  });
  return sortedEntries(sums).map(([key, amounts]) => ({ name: names.get(key) ?? key, amounts }));
}

const total = (expenses: ExpenseDocument[]) =>
  expenses.reduce<ReportAmounts>((acc, expense) => {
    const { EUR, RSD } = amountsOf(expense);
    return { EUR: acc.EUR + EUR, RSD: acc.RSD + RSD };
  }, { EUR: 0, RSD: 0 });

const sortedEntries = (record: Record<string, ReportAmounts>) =>
  Object.entries(record).sort(([, a], [, b]) => b.EUR - a.EUR);

export async function getStatistics(type: StatisticsType): Promise<ReportsInterface> {
  const { current, previous } = getRanges(type);
  const [expenses, prevExpenses, names] = await Promise.all([
    getExpensesInRange(current.from, current.to),
    getExpensesInRange(previous.from, previous.to),
    getCategoryNames(),
  ]);

  const currentTotal = total(expenses);
  const previousTotal = total(prevExpenses);

  return {
    totalAmountInEUR: currentTotal.EUR,
    totalAmountInRSD: currentTotal.RSD,
    prevTotalAmountInEUR: previousTotal.EUR,
    prevTotalAmountInRSD: previousTotal.RSD,
    sortedExpensesByCategory: sumByCategory(expenses, (e) => e.categoryId, names.category)
      .map(({ name, amounts }) => ({ category: name, amounts })),
    sortedExpensesBySubcategory: sumByCategory(expenses, (e) => e.subcategoryId, names.subcategory)
      .map(({ name, amounts }) => ({ subcategory: name, amounts })),
    expensesByPerson: sumBy(expenses, (e) => e.person),
  };
}
