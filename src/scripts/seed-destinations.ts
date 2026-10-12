// Seeds the 29 destinations from content/destinations.json
//   npm run seed:destinations              -> writes to the database
//   npm run seed:destinations -- --dry-run -> only prints what would change
// - Safe to run again: a second run reports "unchanged" for every destination.
// - Never overwrites: an existing destination keeps every value it has; only EMPTY fields are filled.
// - Every destination in the file is set to "published" (also ones that were archived or draft).
// - Before writing, the destinations and destination categories are backed up to backups/.
// - Images are never touched here (see scripts/match-images.ts and scripts/apply-image-matches.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category, Destination } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

type AnyRecord = Record<string, unknown>;
type Location = { lat: number; lng: number };

const BACKEND_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CONTENT_FILE = path.join(BACKEND_FOLDER, "content/destinations.json");

// One destination in content/destinations.json
export interface DestinationContent {
  order: number;
  name: string;
  slug: string;
  category: string;
  theme: string;
  summary: string;
  tagline: string;
  subtitle: string;
  intro: string;
  attractions: { name: string; description: string; verified: boolean; note?: string }[];
  bestTimeToVisit: string;
  howToGetThere: string;
  itinerary: { title: string; description?: string }[];
  location: Location;
  seoTitle: string;
  seoDescription: string;
}

// Read content/destinations.json
export function loadContent(file = CONTENT_FILE) {
  return JSON.parse(fs.readFileSync(file, "utf8")) as { categories: { slug: string; name: string }[]; destinations: DestinationContent[] };
}

// Approximate town-centre / site coordinates. Only used when a destination has no location yet, so every
// destination gets a map pin. Values set in the admin are never overwritten, and the coordinates in
// content/destinations.json win for the 29 destinations. The last entries cover older published destinations.
export const COORDINATES: Record<string, Location> = {
  anuradhapura: { lat: 8.3114, lng: 80.4037 }, "arugam-bay": { lat: 6.8406, lng: 81.8368 }, bentota: { lat: 6.421, lng: 79.998 },
  colombo: { lat: 6.9271, lng: 79.8612 }, dambulla: { lat: 7.8567, lng: 80.6492 }, ella: { lat: 6.8667, lng: 81.0466 },
  galle: { lat: 6.0329, lng: 80.2168 }, habarana: { lat: 8.035, lng: 80.75 }, hatton: { lat: 6.8916, lng: 80.5955 },
  hikkaduwa: { lat: 6.1395, lng: 80.1063 }, jaffna: { lat: 9.6615, lng: 80.0255 }, kalpitiya: { lat: 8.2333, lng: 79.7667 },
  kandy: { lat: 7.2906, lng: 80.6337 }, kitulgala: { lat: 6.9906, lng: 80.4172 }, mirissa: { lat: 5.9483, lng: 80.4716 },
  negombo: { lat: 7.2083, lng: 79.8358 }, "nuwara-eliya": { lat: 6.9497, lng: 80.7891 }, passikudah: { lat: 7.93, lng: 81.56 },
  polonnaruwa: { lat: 7.9403, lng: 81.0188 }, sigiriya: { lat: 7.957, lng: 80.7603 }, sinharaja: { lat: 6.4, lng: 80.5 },
  tangalle: { lat: 6.024, lng: 80.7941 }, trincomalee: { lat: 8.5874, lng: 81.2152 }, udawalawe: { lat: 6.474, lng: 80.8985 },
  unawatuna: { lat: 6.01, lng: 80.249 }, weligama: { lat: 5.975, lng: 80.429 }, wellawaya: { lat: 6.7333, lng: 81.1 },
  wilpattu: { lat: 8.45, lng: 80.0 }, yala: { lat: 6.372, lng: 81.52 },
  // Older published destinations (Colombo-area sights and parks)
  "colombo-city": { lat: 6.9271, lng: 79.8612 }, "old-parliament-building": { lat: 6.9339, lng: 79.843 },
  "jami-ul-alfar-mosque": { lat: 6.9382, lng: 79.851 }, "gangaramaya-temple": { lat: 6.9166, lng: 79.8564 },
  "galle-face-green": { lat: 6.9246, lng: 79.845 }, "kelaniya-raja-maha-viharaya": { lat: 6.9553, lng: 79.922 },
  "st-marys-church-negombo": { lat: 7.2093, lng: 79.8384 }, "yala-national-park": { lat: 6.372, lng: 81.52 },
};

// true when the location has both a latitude and a longitude
export function hasLocation(location: unknown) {
  const point = location as AnyRecord | undefined;
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

// Fills a half-empty location: an existing lat or lng is kept, only the missing value is taken from the fallback.
// Returns undefined when nothing needs to change.
export function completeLocation(current: unknown, fallback?: Location) {
  if (!fallback || hasLocation(current)) return undefined;
  const point = (current ?? {}) as AnyRecord;
  return {
    lat: Number.isFinite(point.lat) ? (point.lat as number) : fallback.lat,
    lng: Number.isFinite(point.lng) ? (point.lng as number) : fallback.lng,
  };
}

// true for null, "" and []
function isBlank(value: unknown) {
  return value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

// The $set update that fills the EMPTY fields of an existing destination from the content file
export function fillBlanks(existing: AnyRecord | null, content: DestinationContent, categoryId: unknown) {
  const destination = existing ?? {};
  const seo = (destination.seo ?? {}) as AnyRecord;
  const update: AnyRecord = {};

  // Only set a field when the database value is empty and the content file has a value
  function fill(field: string, currentValue: unknown, newValue: unknown) {
    if (isBlank(currentValue) && !isBlank(newValue)) update[field] = newValue;
  }

  fill("name", destination.name, content.name);
  fill("subtitle", destination.subtitle, content.subtitle);
  fill("tagline", destination.tagline, content.tagline);
  fill("shortDescription", destination.shortDescription, content.summary);
  fill("description", destination.description, content.intro);
  fill("bestTimeToVisit", destination.bestTimeToVisit, content.bestTimeToVisit);
  fill("howToGetThere", destination.howToGetThere, content.howToGetThere);
  fill("itinerary", destination.itinerary, content.itinerary);
  fill(
    "featuredExperiences",
    destination.featuredExperiences,
    content.attractions.map((attraction) => ({ title: attraction.name, description: attraction.description, verified: attraction.verified })),
  );
  fill("category", destination.category, categoryId);

  const location = completeLocation(destination.location ?? {}, content.location ?? COORDINATES[content.slug]);
  if (location) update.location = location;

  fill("seo.seoTitle", seo.seoTitle, content.seoTitle);
  fill("seo.metaDescription", seo.metaDescription, content.seoDescription);
  if (!destination.order) update.order = content.order;
  if (destination.status !== "published") update.status = "published";
  return update;
}

// Save every destination and destination category to backups/destinations-<date>.json
async function backup() {
  const destinations = await Destination.find({}).lean();
  const categories = await Category.find({ kind: "destination" }).lean();
  const folder = path.join(BACKEND_FOLDER, "backups");
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `destinations-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ destinations, categories }, null, 2));
  return { file, count: destinations.length };
}

// Find (or create) every destination category and return a map of slug -> category id
async function seedCategories(categories: { slug: string; name: string }[], dryRun: boolean) {
  const categoryIds = new Map<string, unknown>();
  for (const [index, category] of categories.entries()) {
    const existing = await Category.findOne({ kind: "destination", slug: category.slug }).select("_id").lean();
    if (existing) {
      categoryIds.set(category.slug, existing._id);
    } else if (dryRun) {
      console.log(`  + category ${category.slug} (would create)`);
      categoryIds.set(category.slug, `<new:${category.slug}>`);
    } else {
      const created = await Category.create({ kind: "destination", slug: category.slug, name: category.name, order: 100 + index });
      console.log(`  + category ${category.slug}`);
      categoryIds.set(category.slug, created._id);
    }
  }
  return categoryIds;
}

export async function seedDestinations({ dryRun }: { dryRun: boolean }) {
  const content = loadContent();

  // Stop early when the content file lists the same slug twice
  const slugs = new Set<string>();
  for (const destination of content.destinations) {
    if (slugs.has(destination.slug)) throw new Error(`Duplicate slug in content file: ${destination.slug}`);
    slugs.add(destination.slug);
  }

  if (!dryRun) {
    const saved = await backup();
    console.log(`Backup: ${saved.count} destinations → ${path.relative(BACKEND_FOLDER, saved.file)}`);
  }

  const categoryIds = await seedCategories(content.categories, dryRun);
  const summary = { created: 0, updated: 0, unchanged: 0 };

  // 1. The 29 destinations from the content file
  for (const destinationContent of content.destinations) {
    const existing = (await Destination.findOne({ slug: destinationContent.slug }).lean()) as AnyRecord | null;
    const update = fillBlanks(existing, destinationContent, categoryIds.get(destinationContent.category));
    const changedFields = Object.keys(update);

    if (!existing) {
      summary.created++;
      console.log(`  + ${destinationContent.slug}${dryRun ? " (would create)" : ""}`);
    } else if (changedFields.length > 0) {
      summary.updated++;
      console.log(`  ~ ${destinationContent.slug}: ${changedFields.join(", ")}${dryRun ? " (would set)" : ""}`);
    } else {
      summary.unchanged++;
      continue;
    }

    if (!dryRun) {
      await Destination.updateOne(
        { slug: destinationContent.slug },
        { $set: update, $setOnInsert: { slug: destinationContent.slug } },
        { upsert: true, runValidators: true },
      );
    }
  }

  // 2. Other destinations (not in the content file) only get default coordinates when they have none
  for (const [slug, defaultLocation] of Object.entries(COORDINATES)) {
    if (slugs.has(slug)) continue;
    const destination = (await Destination.findOne({ slug }).select("location").lean()) as AnyRecord | null;
    const location = destination && completeLocation(destination.location, defaultLocation);
    if (!destination || !location) continue;

    summary.updated++;
    console.log(`  ~ ${slug}: location ${JSON.stringify(location)}${dryRun ? " (would set)" : ""}`);
    if (!dryRun) await Destination.updateOne({ _id: destination._id }, { $set: { location } }, { runValidators: true });
  }

  console.log(`${dryRun ? "[dry run] " : ""}created ${summary.created}, updated ${summary.updated}, unchanged ${summary.unchanged}`);

  // Tell the Next.js site to reload its cached destination pages
  if (!dryRun && (summary.created || summary.updated)) revalidateFrontend(CACHE_TAGS.destinations, CACHE_TAGS.categories);
  return summary;
}

// Runs only when started from the command line (tests import this file without running it)
async function main() {
  try {
    await connectDatabase();
    await seedDestinations({ dryRun: process.argv.includes("--dry-run") });
    // Give the revalidation request a moment to finish before the process exits
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await disconnectDatabase();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await disconnectDatabase();
    process.exit(1);
  }
}

const startedFromCommandLine = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (startedFromCommandLine) main();
