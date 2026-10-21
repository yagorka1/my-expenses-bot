export const COLLECTIONS = {
  expenses: 'expenses',
  categories: 'categories',
  subcategories: 'subcategories',
  members: 'members',
} as const;

export const EXPENSE_SOURCES = {
  bot: 'bot',
  migration: 'migration',
} as const;

/** `createdBy` for writes that don't come from a Firebase Auth user. */
export const SYSTEM_AUTHORS = {
  bot: 'telegram-bot',
  migration: 'migration',
} as const;
