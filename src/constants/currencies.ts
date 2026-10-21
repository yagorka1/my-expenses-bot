export const Currencies = ['RSD', 'EUR', 'USD', 'BYN', 'PLN'];

export const BASE_CURRENCY = 'EUR';
export const REPORT_CURRENCIES = ['EUR', 'RSD'] as const;

export const EXCHANGE_RATES_URL = 'https://api.frankfurter.app/latest';
export const EXCHANGE_RATES_TTL_MS = 12 * 60 * 60 * 1000;
export const EXCHANGE_RATES_TIMEOUT_MS = 5000;

/** Currencies whose rates come from Frankfurter (ECB data). */
export const MARKET_CURRENCIES = ['USD', 'PLN'];

/** ECB doesn't publish RSD/BYN, so they use fixed rates (1 EUR = N units). Keep in sync with expenses-mobile. */
export const FIXED_EUR_RATES: Record<string, number> = {
  RSD: 117.4,
  BYN: 3.39,
};

/** Used only when Frankfurter is unavailable and nothing is cached. */
export const FALLBACK_EUR_RATES: Record<string, number> = {
  EUR: 1,
  USD: 1.12,
  PLN: 4.36,
  RSD: 117.4,
  BYN: 3.39,
};
