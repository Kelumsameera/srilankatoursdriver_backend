import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { getEntityTranslations, saveManualTranslation } from "../services/translation/translation.service.js";

/**
 * Saves the filled-in work files as manual, locked translations (merged with what is already translated).
 * Usage: npx tsx src/scripts/import-translations.ts <locale> [--dry]
 * A saved file is moved to translation-work/<locale>/_done/ so it is never imported twice.
 */
const locale = process.argv[2] ?? "si";
const dry = process.argv.includes("--dry");
const DIR = path.resolve("translation-work", locale);

/** Placeholders like {name} and every URL of the English text must survive the translation. */
function problems(source: string, text: string) {
  const out: string[] = [];
  const braces = (s: string) => (s.match(/\{[^}]*\}/g) ?? []).sort().join(",");
  if (braces(source) !== braces(text)) out.push("placeholders differ");
  for (const url of source.match(/https?:\/\/[^\s)"']+/g) ?? []) if (!text.includes(url)) out.push(`missing URL ${url}`);
  if (text.includes("මිනී")) out.push("forbidden 'මිනී' (use 'මිනි')");
  if (text.includes("වායුසමීකරණය")) out.push("forbidden 'වායුසමීකරණය' (use 'වායුසමනය')");
  return out;
}

async function main() {
  await connectDatabase();
  let saved = 0;
  let skipped = 0;
  const types = (await readdir(DIR).catch(() => [] as string[])).filter((t) => t !== "_done");
  for (const type of types) {
    for (const file of (await readdir(path.join(DIR, type))).filter((f) => f.endsWith(".json"))) {
      const fileName = path.join(DIR, type, file);
      const job = JSON.parse(await readFile(fileName, "utf8")) as { type: string; id: string; locale: string; source: Record<string, string>; translated?: Record<string, string> };
      if (job.locale !== locale) throw new Error(`${fileName}: locale is ${job.locale}, expected ${locale}`);
      const translated = Object.fromEntries(Object.entries(job.translated ?? {}).filter(([p, v]) => p in job.source && typeof v === "string" && v.trim()));
      const missing = Object.keys(job.source).filter((p) => !(p in translated));
      const issues = Object.entries(translated).flatMap(([p, v]) => problems(job.source[p], v).map((x) => `${p}: ${x}`));
      if (missing.length || issues.length) {
        console.log(`SKIP ${type}/${file}: ${missing.length} untranslated field(s)${issues.length ? `; ${issues.join("; ")}` : ""}`);
        skipped++;
        continue;
      }
      // Keep the fields that are already translated, add / replace the new ones.
      const current = await getEntityTranslations(job.type, job.id);
      const fields = { ...current.locales[locale].fields, ...translated };
      if (!dry) {
        await saveManualTranslation(job.type, job.id, locale, { fields, locked: true, published: true });
        await mkdir(path.join(DIR, "_done", type), { recursive: true });
        await rename(fileName, path.join(DIR, "_done", type, file));
      }
      console.log(`${dry ? "OK (dry run)" : "SAVED"} ${type}/${file} – ${Object.keys(translated).length} field(s)`);
      saved++;
    }
  }
  console.log(`${dry ? "Would save" : "Saved"} ${saved}, skipped ${skipped}`);
  await disconnectDatabase();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

