import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { TRANSLATABLE } from "../services/translation/registry.js";
import { getEntityTranslations } from "../services/translation/translation.service.js";

/**
 * Writes one JSON work file per item that still needs translating into a language.
 * Usage: npx tsx src/scripts/export-translations.ts <locale> [contentType]
 * Output: translation-work/<locale>/<contentType>/<id>.json  (read-only on the database)
 */
const locale = process.argv[2] ?? "si";
const only = process.argv[3];
const OUT = path.resolve("translation-work", locale);

async function main() {
  await connectDatabase();
  let files = 0;
  for (const type of Object.keys(TRANSLATABLE).filter((t) => !only || t === only)) {
    const docs = await TRANSLATABLE[type].model.find({}).select("_id").limit(500).lean();
    for (const d of docs) {
      const id = String(d._id);
      const entity = await getEntityTranslations(type, id);
      const current = entity.locales[locale];
      if (!current || current.locked || current.state === "up_to_date") continue;
      // Outdated: the English changed, so redo every field. Missing / failed: only the empty fields.
      const todo = Object.fromEntries(Object.entries(entity.source).filter(([p]) => current.state === "outdated" || !current.fields[p]));
      if (Object.keys(todo).length === 0) continue;
      await mkdir(path.join(OUT, type), { recursive: true });
      await writeFile(path.join(OUT, type, `${id}.json`), JSON.stringify({ type, id, locale, source: todo, translated: {} }, null, 2) + "\n");
      files++;
    }
  }
  console.log(`Wrote ${files} work file(s) to ${OUT}`);
  await disconnectDatabase();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

