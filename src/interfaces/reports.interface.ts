export interface ReportAmounts {
  EUR: number;
  RSD: number;
}

export interface ReportsInterface {
  totalAmountInEUR: number;
  totalAmountInRSD: number;
  prevTotalAmountInEUR: number;
  prevTotalAmountInRSD: number;
  sortedExpensesByCategory: Array<{
    category: string;
    amounts: ReportAmounts;
  }>;
  sortedExpensesBySubcategory: Array<{
    subcategory: string;
    amounts: ReportAmounts;
  }>;
  expensesByPerson: Record<string, ReportAmounts>;
}
