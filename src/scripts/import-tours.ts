import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { connectDatabase, disconnectDatabase, withOptionalTransaction } from "../config/db.js";
import { Category, Tour } from "../models/index.js";
import { tourCreate } from "../validations/content.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const schema = z.object({
  categories: z.array(z.object({ slug, name: z.string().min(1).max(80), description: z.string().optional() })),
  tours: z.array(z.object({
    itineraryStatus: z.enum(["awaiting-confirmation"]).optional(),
    shortDescription: z.string().max(400).optional(), description: z.string().optional(),
    highlights: z.array(z.string().max(300)).optional(),
    importKey: z.string(), slug, name: z.string().min(2).max(160), categorySlug: slug,
    duration: z.object({ days: z.number().int().min(1).max(365), nights: z.number().int().min(0).max(365) }),
    itineraryReference: z.array(z.object({
      day_start: z.number().int().min(1), day_end: z.number().int().min(1),
      location: z.string().min(1).max(160), activities_summary: z.array(z.string().max(200)),
    })),
  })),
});
export function loadTourImport() {
  const data = schema.parse(JSON.parse(fs.readFileSync(path.join(root, "content/tours-import.json"), "utf8")));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const tours = data.tours.filter((tour) => {
    if (!data.categories.some((category) => category.slug === tour.categorySlug)) throw new Error(`Unknown category: ${tour.categorySlug}`);
    if (seen.has(tour.slug)) { duplicates.push(tour.importKey); return false; }
    seen.add(tour.slug);
    return true;
  });
  return { ...data, tours, duplicates };
}
export function mapTour(tour: ReturnType<typeof loadTourImport>["tours"][number]) {
  const itinerary = tour.itineraryReference.map((step) => {
    if (step.day_end < step.day_start || step.day_end > tour.duration.days) throw new Error(`Invalid day range: ${tour.slug}`);
    return {
      day: step.day_start,
      title: step.day_start === step.day_end ? step.location : `${step.location} (days ${step.day_start}-${step.day_end})`,
      location: step.location,
      activities: step.activities_summary,
      description: step.activities_summary.join("; "),
    };
  });
  const parsed = tourCreate.parse({
    title: tour.name, slug: tour.slug, status: "draft",
    shortDescription: tour.shortDescription, description: tour.description, highlights: tour.highlights,
    durationDays: tour.duration.days, durationNights: tour.duration.nights,
    startLocation: itinerary[0]?.location ?? "", endLocation: itinerary.at(-1)?.location ?? "",
    itinerary,
  });
  return { ...parsed, slug: tour.slug };
}

async function main() {
  const data = loadTourImport();
  // Validate every record before connecting or writing anything.
  const records = data.tours.map(mapTour);
  const dryRun = !process.argv.includes("--apply");
  try {
    await connectDatabase();
    const categories = await Category.find({ kind: "tour" }).lean();
    const tours = await Tour.find({}).lean();
    const missing = records.filter((record) => !tours.some((tour) => tour.slug === record.slug || tour.title.toLowerCase() === record.title.toLowerCase()));
    console.log(JSON.stringify({ dryRun, uniqueTours: records.length, duplicates: data.duplicates, toCreate: missing.map((tour) => tour.slug), existingSkipped: records.length - missing.length }));
    if (dryRun || !missing.length) return;
    const folder = path.join(root, "backups");
    fs.mkdirSync(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(folder, `tours-before-import-${stamp}.json`), JSON.stringify({ categories, tours }, null, 2));
    const result = await withOptionalTransaction(async (session) => {
      const created: string[] = [];
      for (const record of missing) {
        const source = data.tours.find((tour) => tour.slug === record.slug)!;
        const categorySource = data.categories.find((category) => category.slug === source.categorySlug)!;
        const category = await Category.findOneAndUpdate(
          { kind: "tour", slug: categorySource.slug },
          { $setOnInsert: { name: categorySource.name, description: categorySource.description, enabled: true } },
          { upsert: true, returnDocument: "after", runValidators: true, session: session ?? undefined },
        );
        const saved = await Tour.updateOne({ slug: record.slug }, { $setOnInsert: { ...record, category: category._id } }, { upsert: true, runValidators: true, session: session ?? undefined });
        if (saved.upsertedCount) created.push(record.slug);
      }
      return created;
    });
    fs.writeFileSync(path.join(folder, `tours-import-result-${stamp}.json`), JSON.stringify({ created: result, duplicates: data.duplicates }, null, 2));
    console.log(JSON.stringify({ created: result.length, status: "draft", existingModified: 0 }));
    const count = await Tour.countDocuments({ slug: { $in: records.map((record) => record.slug) } });
    console.log(JSON.stringify({ verifiedImportedSlugs: count }));
  } finally {
    await disconnectDatabase();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; });
}
