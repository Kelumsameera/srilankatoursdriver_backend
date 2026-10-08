/**
 * Translates every non-archived CMS item into all locales (only missing/outdated fields;
 * manual and locked translations are kept). Default: estimate only. `--apply` runs it.
 */
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { TARGET_LOCALES } from "../../../src/config/locales.js";
import { Translation } from "../../../src/models/index.js";
import { TRANSLATABLE, extractFields, generateTranslations, FREE_GOOGLE_LOCALES } from "../../../src/services/translation/index.js";
import { sha256 } from "../../../src/utils/helpers.js";

const APPLY = process.argv.includes("--apply");
const dec = (m: unknown) => Object.fromEntries(Object.entries(m instanceof Map ? Object.fromEntries(m) : (m ?? {})).map(([k, v]) => [k.replace(/~/g, "."), String(v)]));
await connectDatabase();
let paidChars = 0, freeChars = 0, items = 0;
const failures: string[] = [];
for (const [type, cfg] of Object.entries(TRANSLATABLE)) {
  const docs = await cfg.model.find({ status: { $ne: "archived" } }).lean();
  for (const doc of docs as Record<string, unknown>[]) {
    const fields = extractFields(doc, cfg.fields);
    if (!Object.keys(fields).length) continue;
    items++;
    const rows = await Translation.find({ entityType: type, entityId: doc._id }).lean();
    for (const locale of TARGET_LOCALES) {
      const row = rows.find((r) => r.locale === locale);
      if (row?.locked) continue;
      const prev = dec(row?.fields), hashes = dec(row?.sourceHashes);
      const chars = Object.entries(fields).filter(([p, v]) => !prev[p] || hashes[p] !== sha256(v)).reduce((n, [, v]) => n + v.length, 0);
      if (FREE_GOOGLE_LOCALES.has(locale)) freeChars += chars; else paidChars += chars;
    }
    if (APPLY) {
      const res = await generateTranslations({ entityType: type, entityId: String(doc._id) });
      const bad = res.filter((r) => r.error);
      bad.forEach((r) => failures.push(`${type} "${doc[cfg.titleField]}" ${r.locale}: ${r.error}`));
      console.log(`${bad.length ? "✗" : "✓"} ${type} ${String(doc[cfg.titleField]).slice(0, 50)} (${res.reduce((n, r) => n + r.translated, 0)} fields)`);
    }
  }
}
console.log(JSON.stringify({ items, deeplChars: paidChars, freeGoogleChars: freeChars, failures: failures.length }, null, 1));
failures.slice(0, 30).forEach((f) => console.log(f));
await disconnectDatabase();
