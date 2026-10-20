import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Tour, Destination } from "../models/index.js";
import { loadTourImport, mapTour } from "./import-tours.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

type RecordData = Record<string, unknown>;
export function detailPatch(existing: RecordData, source: ReturnType<typeof mapTour>) {
  const patch: RecordData = {};
  for (const field of ["shortDescription", "description", "highlights", "itinerary", "startLocation", "endLocation"] as const) {
    const current = existing[field];
    const value = source[field];
    const hasValue = value != null && value !== "" && !(Array.isArray(value) && !value.length);
    if (hasValue && (current == null || current === "" || (Array.isArray(current) && !current.length))) patch[field] = value;
  }
  // Remove the archive's editorial TODO only when it is still present verbatim.
  const editorialTodo = "source day text appears duplicated from Galle and needs review";
  if (Array.isArray(existing.itinerary)) {
    existing.itinerary.forEach((step: RecordData, index: number) => {
      if (Array.isArray(step.activities) && step.activities.includes(editorialTodo)) {
        patch[`itinerary.${index}.activities`] = step.activities.filter((activity) => activity !== editorialTodo);
        if (typeof step.description === "string") {
          patch[`itinerary.${index}.description`] = step.description.split("; ").filter((part) => part !== editorialTodo).join("; ");
        }
      }
    });
  }
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
async function main() {
  const records = loadTourImport().tours.map(mapTour);
  const dryRun = !process.argv.includes("--apply");
  try {
    await connectDatabase();
    const tours = await Tour.find({ slug: { $in: records.map((record) => record.slug) } }).lean();
    if (tours.length !== records.length) throw new Error("Expected all 26 imported tours to exist");
    const destinations = await Destination.find({ status: "published" }).select("_id name slug").lean();
    const changes = tours.map((tour) => {
      const source = records.find((record) => record.slug === tour.slug)!;
      const patch = detailPatch(tour, source);
      if (!tour.destinations.length) {
        const places = new Set(source.itinerary?.map((step) => normalize(step.location ?? "")));
        const matching = destinations.filter((destination) => places.has(normalize(destination.name)) || places.has(normalize(destination.slug)));
        if (matching.length) patch.destinations = matching.map((destination) => destination._id);
      }
      return { tour, patch };
    }).filter(({ patch }) => Object.keys(patch).length);
    console.log(JSON.stringify({ dryRun, changes: changes.map(({ tour, patch }) => ({ slug: tour.slug, fields: Object.keys(patch) })) }));
    if (dryRun || !changes.length) return;
    const folder = path.join(root, "backups");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `tours-before-details-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(tours, null, 2));
    let updated = 0;
    for (const { tour, patch } of changes) {
      const saved = await Tour.updateOne({ _id: tour._id, updatedAt: tour.updatedAt }, { $set: patch }, { runValidators: true });
      if (saved.matchedCount !== 1) throw new Error(`Tour changed during import: ${tour.slug}; rerun to preserve the edit`);
      updated += saved.modifiedCount;
    }
    console.log(JSON.stringify({ updated, statusChanged: false }));
    revalidateFrontend(CACHE_TAGS.tours, CACHE_TAGS.destinations);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  } finally {
    await disconnectDatabase();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Enrichment failed"); process.exitCode = 1; });
}
