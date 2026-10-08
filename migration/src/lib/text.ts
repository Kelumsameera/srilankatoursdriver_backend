import crypto from "node:crypto";
import { OLD_SITE } from "../config.js";

/** Collapses whitespace (incl. &nbsp;) and trims. */
export function cleanText(input: string | null | undefined): string {
  return (input ?? "").replace(/[\u00a0\u2007\u202f]/g, " ").replace(/\s+/g, " ").trim();
}

/** "10 Days East Coast Tour - Sri Lanka Tours Drivers" → "10 Days East Coast Tour" */
export function stripTitleSuffix(title: string | null | undefined): string | null {
  const t = cleanText(title);
  if (!t) return null;
  return t.replace(OLD_SITE.titleSuffix, "").trim() || null;
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Lowercase, accent-free, punctuation-free form used for duplicate detection. */
export function comparableText(input: string | null | undefined): string {
  return cleanText(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  us$: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  lkr: "LKR",
  rs: "LKR",
  "rs.": "LKR",
  "₹": "INR",
  inr: "INR",
  aud: "AUD",
  a$: "AUD",
  cad: "CAD",
  chf: "CHF",
};

export interface ParsedPrice {
  amount: number;
  currency: string | null;
  raw: string;
}

const PRICE_PATTERNS: RegExp[] = [
  // symbol / code BEFORE the amount: $640.00, USD 1,280, Rs. 5000, LKR 28,000
  /(US\$|\$|€|£|₹|A\$|\b(?:USD|EUR|GBP|LKR|INR|AUD|CAD|CHF)\b|\bRs\.?)\s*(\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i,
  // code AFTER the amount: 28,000LKR, 640 USD
  /(\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(USD|EUR|GBP|LKR|INR|AUD|CAD|CHF|Rs\.?|\$|€|£)(?![a-z])/i,
];

function toAmount(numeric: string): number | null {
  const n = Number(numeric.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Extracts the first price from free text. Never guesses: returns null when no currency marker
 * is present (a bare number is not treated as a price).
 */
export function parsePrice(text: string | null | undefined): ParsedPrice | null {
  const t = cleanText(text);
  if (!t) return null;
  for (const [i, re] of PRICE_PATTERNS.entries()) {
    const m = re.exec(t);
    if (!m) continue;
    const [symbol, numeric] = i === 0 ? [m[1], m[2]] : [m[2], m[1]];
    const amount = toAmount(numeric);
    if (amount === null) continue;
    return { amount, currency: CURRENCY_SYMBOLS[symbol.toLowerCase()] ?? null, raw: m[0].trim() };
  }
  return null;
}

/** All prices in a text, in order of appearance. */
export function parseAllPrices(text: string | null | undefined): ParsedPrice[] {
  const t = cleanText(text);
  const out: ParsedPrice[] = [];
  const re = new RegExp(PRICE_PATTERNS[0].source, "gi");
  for (const m of t.matchAll(re)) {
    const amount = toAmount(m[2]);
    if (amount !== null) out.push({ amount, currency: CURRENCY_SYMBOLS[m[1].toLowerCase()] ?? null, raw: m[0].trim() });
  }
  const re2 = new RegExp(PRICE_PATTERNS[1].source, "gi");
  for (const m of t.matchAll(re2)) {
    const amount = toAmount(m[1]);
    if (amount !== null && !out.some((p) => p.raw.includes(m[1]))) out.push({ amount, currency: CURRENCY_SYMBOLS[m[2].toLowerCase()] ?? null, raw: m[0].trim() });
  }
  return out;
}

export interface ParsedDuration {
  days: number | null;
  nights: number | null;
  hours: number | null;
  raw: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15 };

function wordOrNumber(s: string): number {
  return NUMBER_WORDS[s.toLowerCase()] ?? Number(s);
}

/** "10 days", "10 Days 9 Nights", "05-days", "3 Hours", "half day", "one day" → structured duration. */
export function parseDuration(text: string | null | undefined): ParsedDuration | null {
  const t = cleanText(text).replace(/-/g, " ");
  if (!t) return null;
  const num = "(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen)";
  const days = new RegExp(`\\b${num}\\s*days?\\b`, "i").exec(t);
  const nights = new RegExp(`\\b${num}\\s*nights?\\b`, "i").exec(t);
  const hours = new RegExp(`\\b${num}\\s*(?:hours?|hrs?)\\b`, "i").exec(t);
  const half = /\bhalf[\s-]*day\b/i.test(t);
  if (!days && !nights && !hours && !half) return null;
  return {
    days: days ? wordOrNumber(days[1]) : null,
    nights: nights ? wordOrNumber(nights[1]) : null,
    hours: hours ? wordOrNumber(hours[1]) : half ? 4 : null,
    raw: cleanText(text),
  };
}

/** "Day 01" → 1, "DAY 12 – Kandy" → 12 */
export function parseDayNumber(text: string | null | undefined): number | null {
  const m = /\bday\s*0*(\d{1,3})\b/i.exec(cleanText(text));
  return m ? Number(m[1]) : null;
}

/** First integer in a text ("Max People 10" → 10). */
export function parseFirstInt(text: string | null | undefined): number | null {
  const m = /(\d+)/.exec(cleanText(text));
  return m ? Number(m[1]) : null;
}

/** Decodes a Cloudflare email-protection hex string (data-cfemail / #hash). */
export function decodeCfEmail(encoded: string | null | undefined): string | null {
  if (!encoded || !/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2 !== 0) return null;
  const key = parseInt(encoded.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < encoded.length; i += 2) out += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out : null;
}

/** "(+94) 769 300 334" → "+94769300334" (digits only, leading + kept). Null if too short to be a phone number. */
export function normalizePhone(input: string | null | undefined): string | null {
  const t = cleanText(input);
  if (!t) return null;
  const plus = /^\s*(\(?\+|00)/.test(t);
  let digits = t.replace(/\D/g, "");
  if (t.trim().startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

/** Parses "April 8, 2025" / "2025-04-08" style dates → ISO date (YYYY-MM-DD). */
export function parseDate(text: string | null | undefined): string | null {
  const t = cleanText(text);
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 1990 || y > 2100) return null;
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Splits "English, French & German" → ["English","French","German"]. */
export function splitList(text: string | null | undefined): string[] {
  return cleanText(text)
    .split(/\s*(?:,|\/|&|\band\b|;|\|)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
