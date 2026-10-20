import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Tour, Media } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mapping = z.array(z.object({ slug: z.string().min(1), mediaId: z.string().regex(/^[a-f0-9]{24}$/), alt: z.string().min(1) })).length(26)
  .parse(JSON.parse(fs.readFileSync(path.join(root, "content/tour-image-mapping.json"), "utf8")));
if (new Set(mapping.map((entry) => entry.slug)).size !== mapping.length || new Set(mapping.map((entry) => entry.mediaId)).size !== mapping.length) throw new Error("Tour covers must be distinct");

async function main() {
  const dryRun = !process.argv.includes("--apply");
  try {
    await connectDatabase();
    const tours = await Tour.find({ slug: { $in: mapping.map((entry) => entry.slug) } }).lean();
    if (tours.length !== mapping.length) throw new Error("Imported tours are missing");
    const plans = [];
    for (const entry of mapping) {
      const tour = tours.find((tour) => tour.slug === entry.slug)!;
      const media = await Media.findById(entry.mediaId).lean();
      if (!media || media.resourceType !== "image") throw new Error(`Image missing: ${entry.slug}`);
      // Preserve any cover selected in Admin after the import.
      if (tour.heroMedia?.url) continue;
      const response = await fetch(media.secureUrl, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Image unavailable: ${entry.slug}`);
      plans.push({ tour, heroMedia: { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "image" as const, format: media.format, width: media.width, height: media.height, alt: entry.alt } });
    }
    console.log(JSON.stringify({ dryRun, toUpdate: plans.length, existingCoversPreserved: tours.length - plans.length, uniqueCovers: new Set(plans.map((plan) => plan.heroMedia.url)).size }));
    if (dryRun || !plans.length) return;
    const folder = path.join(root, "backups");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `tours-before-covers-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(tours, null, 2));
    let updated = 0;
    for (const { tour, heroMedia } of plans) {
      const result = await Tour.updateOne({ _id: tour._id, updatedAt: tour.updatedAt }, { $set: { heroMedia } }, { runValidators: true });
      if (result.matchedCount !== 1) throw new Error(`Tour edited concurrently: ${tour.slug}`);
      updated += result.modifiedCount;
    }
    console.log(JSON.stringify({ updated, publicationStateChanged: false }));
    revalidateFrontend(CACHE_TAGS.tours);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  } finally { await disconnectDatabase(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Tour image assignment failed"); process.exitCode = 1; });
