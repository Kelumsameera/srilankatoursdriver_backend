/** Expand existing published excursions. Dry-run by default; back up before applying. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Excursion } from "../models/Excursion.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const apply = process.argv.includes("--apply");
if (apply && env.NODE_ENV !== "development") throw new Error("This content helper only writes in development.");
const { excursions } = z.object({
  excursions: z.array(z.object({
    slug: z.string().min(1),
    description: z.string().min(500),
    highlights: z.array(z.string().min(1)).min(3),
  })).min(1),
}).parse(JSON.parse(readFileSync(new URL("../../content/excursion-details.json", import.meta.url), "utf8")));
if (new Set(excursions.map((entry) => entry.slug)).size !== excursions.length) throw new Error("Duplicate excursion slugs");

await connectDatabase();
try {
  const documents = await Excursion.find({ slug: { $in: excursions.map((entry) => entry.slug) }, status: "published" });
  // Validate the whole batch before the first write. Never create or republish excursions.
  const updates = [];
  for (const entry of excursions) {
    const document = documents.find((item) => item.slug === entry.slug);
    if (!document) throw new Error(`Published excursion not found: ${entry.slug}`);
    const before = { description: document.description, highlights: [...document.highlights] };
    if (before.description === entry.description && JSON.stringify(before.highlights) === JSON.stringify(entry.highlights)) continue;
    document.set({ description: entry.description, highlights: entry.highlights });
    await document.validate();
    updates.push({ id: document._id, slug: entry.slug, before, after: { description: entry.description, highlights: entry.highlights } });
  }
  if (apply && updates.length) {
    const folder = new URL("../../backups/", import.meta.url);
    mkdirSync(folder, { recursive: true });
    const backup = new URL(`excursion-details-before-${Date.now()}.json`, folder);
    writeFileSync(backup, JSON.stringify(updates, null, 2));
    console.log(`Backup saved: ${backup.pathname.split("/").pop()}`);
  }
  for (const update of updates) {
    if (apply) {
      const result = await Excursion.updateOne(
        { _id: update.id, status: "published", description: update.before.description, highlights: update.before.highlights },
        { $set: update.after },
        { runValidators: true },
      );
      if (result.matchedCount !== 1) throw new Error(`Concurrent edit detected: ${update.slug}; stopped, check backup before retrying`);
    }
    console.log(`${apply ? "Updated" : "Would update"}: ${update.slug}`);
  }
  if (apply && updates.length) {
    revalidateFrontend(CACHE_TAGS.excursions);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`${apply ? "Applied" : "Validated"} ${updates.length} excursion content updates; prices, media and booking fields preserved.`);
} finally {
  await disconnectDatabase();
}
