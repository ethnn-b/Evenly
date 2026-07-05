// App currency setting.
//
// Money is stored everywhere in integer minor units (paise for INR, cents for
// USD). This file only controls how those amounts are shown and how typed input
// is read. To switch the whole app to another currency, change DEFAULT_CURRENCY.

export interface Currency {
  code: string; // ISO 4217, e.g. "INR"
  symbol: string; // shown in the UI, e.g. "₹"
}

export const CURRENCIES = {
  INR: { code: "INR", symbol: "₹" },
  USD: { code: "USD", symbol: "$" },
} as const satisfies Record<string, Currency>;

// The currency used across the app. Rupees by default.
export const DEFAULT_CURRENCY: Currency = CURRENCIES.INR;
