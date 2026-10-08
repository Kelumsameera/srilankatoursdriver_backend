import { env, isTest } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Prices are entered in Admin in any currency (mostly LKR) but the public site shows US dollars.
 * Rates come from a free, key-less daily feed and are cached; when the feed is unreachable the last
 * good rates (or the LKR fallback from the environment) are used, so pages never break.
 */
const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;

/** Units of each currency per 1 USD. */
type Rates = Record<string, number>;

let cache: { rates: Rates; expires: number } | null = null;
let inflight: Promise<Rates> | null = null;

const fallbackRates = (): Rates => ({ USD: 1, LKR: env.FALLBACK_LKR_PER_USD });

async function fetchRates(): Promise<Rates> {
  const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; rates?: Rates };
  if (json.result !== "success" || !json.rates || !(json.rates.LKR > 0)) throw new Error("Unexpected rates payload");
  return json.rates;
}

export async function getUsdRates(): Promise<Rates> {
  if (isTest) return fallbackRates();
  if (cache && cache.expires > Date.now()) return cache.rates;
  inflight ??= fetchRates()
    .then((rates) => {
      cache = { rates, expires: Date.now() + TTL_MS };
      return rates;
    })
    .catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, "Exchange rates unavailable – using cached/fallback rates");
      const rates = cache?.rates ?? fallbackRates();
      cache = { rates, expires: Date.now() + RETRY_MS };
      return rates;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const usd = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;

/** "Car LKR 42,000 · Van LKR 50,000" → "Car $140 · Van $167" (only currencies we have a rate for). */
export function convertPriceText(text: string, rates: Rates): string {
  return text.replace(/\b([A-Z]{3})\.?\s?(\d[\d,]*(?:\.\d+)?)/g, (match, code: string, num: string) => {
    const rate = rates[code];
    if (code === "USD" || !rate) return match;
    return usd(Number(num.replace(/,/g, "")) / rate);
  });
}

const AMOUNT_FIELDS = ["price", "dailyRate"] as const;

/** Returns a copy of a public tour/excursion/vehicle with its prices in USD. Unknown currencies are left untouched. */
export function toUsd<T extends Record<string, unknown>>(doc: T, rates: Rates): T {
  const out: Record<string, unknown> = { ...doc };
  if (typeof doc.priceNote === "string") out.priceNote = convertPriceText(doc.priceNote, rates);
  const currency = typeof doc.currency === "string" ? doc.currency.toUpperCase() : "USD";
  const rate = rates[currency];
  if (currency !== "USD" && rate) {
    out.currency = "USD";
    for (const f of AMOUNT_FIELDS) {
      if (typeof doc[f] === "number") out[f] = Math.round((doc[f] as number) / rate);
    }
  }
  return out as T;
}
