export interface ReportsInterface {
  totalAmountInEUR: number;
  totalAmountInRSD: number;
  prevTotalAmountInEUR: number;
  prevTotalAmountInRSD: number;
  sortedExpensesByCategory: Array<{
    category: string;
    amounts: {
      EUR: number;
      RSD: number;
    };
  }>;
  sortedExpensesBySubcategory: Array<{
    subcategory: string;
    amounts: {
      EUR: number;
      RSD: number;
    };
  }>;
  expensesByPerson: {
    person: string;
    amounts: {
      EUR: number;
      RSD: number;
    };
  };
}
