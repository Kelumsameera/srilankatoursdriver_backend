import crypto from "node:crypto";
import slugifyLib from "slugify";
import { Types } from "mongoose";
import { ApiError } from "./ApiError.js";

const slugifyFn = slugifyLib as unknown as (s: string, o?: object) => string;

export function slugify(input: string): string {
  return slugifyFn(input, { lower: true, strict: true, trim: true }).slice(0, 120) || "item";
}

/** Escapes user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value);
}

export function assertObjectId(value: unknown, label = "id"): string {
  if (!isObjectId(value)) throw ApiError.badRequest(`Invalid ${label}`);
  return value;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Human-friendly reference such as SLTD-B-261007-7KQ2 */
export function generateReference(prefix: string): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(5);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `SLTD-${prefix}-${ymd}-${suffix}`;
}

/**
 * Recursively removes keys that could be interpreted as MongoDB operators ("$gt", "$where" …) or
 * that could pollute prototypes. Dotted keys are kept: Zod strips unknown keys from every body
 * schema, and the only free-form map (translation field paths such as "seo.seoTitle") is matched
 * against known source paths and encoded before it is stored.
 */
export function stripMongoOperators<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripMongoOperators(v)) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Types.ObjectId)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".$") || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = stripMongoOperators(v);
    }
    return out as T;
  }
  return value;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Stable keyed hash of a JSON-like value (object keys sorted) – used to recognise duplicate submissions.
 * Keyed (HMAC) because submissions contain personal data such as e-mail addresses: a plain hash
 * could be reversed by guessing the missing field.
 */
export function fingerprint(value: unknown, key: string): string {
  const normalise = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(normalise);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, normalise((v as Record<string, unknown>)[k])]);
    }
    return typeof v === "string" ? v.trim().toLowerCase() : v;
  };
  return crypto.createHmac("sha256", key).update(JSON.stringify(normalise(value))).digest("hex");
}

/** Deterministic hash of a set of strings, used to detect stale translations. */
export function hashFields(fields: Record<string, string>): string {
  const keys = Object.keys(fields).sort();
  return sha256(JSON.stringify(keys.map((k) => [k, fields[k]])));
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Prevent CSV/formula injection when opened in spreadsheet software.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(getPath(r, c.key))).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    if (next === null || next === undefined || typeof next !== "object") return; // never create structure that doesn't exist in source
    cur = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (last in cur) cur[last] = value;
}
