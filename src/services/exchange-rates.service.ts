import axios from 'axios';
import {
  BASE_CURRENCY,
  Currencies,
  EXCHANGE_RATES_TIMEOUT_MS,
  EXCHANGE_RATES_TTL_MS,
  EXCHANGE_RATES_URL,
  FALLBACK_EUR_RATES,
  FIXED_EUR_RATES,
  MARKET_CURRENCIES,
} from '../constants/currencies';

interface FrankfurterResponse {
  rates: Record<string, number | undefined>;
}

let cached: { rates: Record<string, number>; fetchedAt: number } | undefined;

/** How many units of each currency equal 1 EUR. Never throws: falls back to cached/static rates. */
export async function getEurRates(): Promise<Record<string, number>> {
  if (cached && Date.now() - cached.fetchedAt < EXCHANGE_RATES_TTL_MS) {
    return cached.rates;
  }

  try {
    const { data } = await axios.get<FrankfurterResponse>(EXCHANGE_RATES_URL, {
      params: { base: BASE_CURRENCY, symbols: MARKET_CURRENCIES.join(',') },
      timeout: EXCHANGE_RATES_TIMEOUT_MS,
    });
    const rates = Object.fromEntries(
      Currencies.map((code) => [
        code,
        code === BASE_CURRENCY ? 1 : (FIXED_EUR_RATES[code] ?? data.rates[code] ?? FALLBACK_EUR_RATES[code]),
      ]),
    );
    cached = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    console.error('⚠️ Failed to fetch exchange rates, using fallback:', err instanceof Error ? err.message : err);
    return cached?.rates ?? FALLBACK_EUR_RATES;
  }
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Converts an amount into every supported currency through EUR (same logic as expenses-mobile). */
export function convertToAllCurrencies(amount: number, currency: string, eurRates: Record<string, number>) {
  const amountInEur = amount / eurRates[currency];

  return Object.fromEntries(
    Currencies.map((target) => [
      target,
      target === currency ? roundMoney(amount) : roundMoney(amountInEur * eurRates[target]),
    ]),
  );
}
