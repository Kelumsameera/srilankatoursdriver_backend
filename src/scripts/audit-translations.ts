import { writeFile, mkdir } from "node:fs/promises";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { TARGET_LOCALES } from "../config/locales.js";
import { Translation, UiMessage } from "../models/index.js";
import { TRANSLATABLE, extractFields } from "../services/translation/registry.js";
import { computeState } from "../services/translation/translation.service.js";

try {
  await connectDatabase();
  console.log(JSON.stringify({ provider: env.TRANSLATION_PROVIDER, providerKeyConfigured: Boolean(env.TRANSLATION_API_KEY), googleKeyConfigured: Boolean(env.GOOGLE_TRANSLATE_API_KEY), geminiConfigured: Boolean(env.GEMINI_API_KEY) }));
  const report = [];
  const summary = [];
  for (const [type, config] of Object.entries(TRANSLATABLE)) {
    const docs = await config.model.find({}).lean();
    const rows = await Translation.find({ entityType: type }).lean();
    const index = new Map(rows.map((row) => [`${row.entityId}:${row.locale}`, row]));
    const counts: Record<string, Record<string, number>> = {};
    for (const locale of TARGET_LOCALES) {
      counts[locale] = {};
      for (const doc of docs) {
        const source = extractFields(doc, config.fields);
        const row = index.get(`${doc._id}:${locale}`);
        const state = computeState(source, row);
        counts[locale][state] = (counts[locale][state] ?? 0) + 1;
        const fields = Object.fromEntries(Object.entries(row?.fields ?? {}).map(([key, text]) => [key.replace(/~/g, "."), text]));
        const identical = Object.keys(source).filter((key) => fields[key] === source[key]);
        if (state !== "up_to_date" || identical.length) report.push({ type, id: String(doc._id), locale, state, locked: row?.locked ?? false, published: row?.published, source, fields, identical });
      }
    }
    const item = { type, documents: docs.length, counts };
    summary.push(item);
    console.log(JSON.stringify(item));
  }
  await mkdir("translation-work", { recursive: true });
  await writeFile("translation-work/audit.json", JSON.stringify(report, null, 2));
  const overrides = await UiMessage.find({}).select("locale key value -_id").lean();
  await writeFile("translation-work/ui-overrides.json", JSON.stringify(overrides, null, 2));
  const incomplete = report.filter((item) => item.state !== "up_to_date").length;
  const coverage = { generatedAt: new Date().toISOString(), locales: TARGET_LOCALES, contentItems: summary.reduce((sum, item) => sum + item.documents, 0), incomplete, summary };
  await writeFile("translation-work/coverage.json", JSON.stringify(coverage, null, 2));
  console.log(JSON.stringify({ pendingOrIdentical: report.length, incomplete, uiOverrides: overrides.length }));
  if (incomplete) process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
