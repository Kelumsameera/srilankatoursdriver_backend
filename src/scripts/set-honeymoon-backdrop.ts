import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category, Media, Page, PageSection } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

// Homepage "Honeymoon tours" section: a beach photo along the bottom that fades into the light background,
// the same background as the "Popular tours" section above it. Change both in Admin → Homepage → the section.
// Dry run by default; add --apply to write (a backup of the section is saved first).
const PHOTO = "srilankatoursdriver/hero/zip-heromirissa-poster";
const ALT = "Mirissa Beach, south coast of Sri Lanka";

try {
  await connectDatabase();
  const page = await Page.findOne({ slug: "home" }).lean();
  if (!page) throw new Error("Homepage missing");
  const category = await Category.findOne({ kind: "tour", slug: "honeymoon-tours" }).lean();
  if (!category) throw new Error("Category honeymoon-tours missing");
  const section = await PageSection.findOne({ page: page._id, type: "popularTours", "settings.category": category._id }).lean();
  if (!section) throw new Error("Honeymoon section missing on the homepage");
  const photo = await Media.findOne({ publicId: PHOTO, resourceType: "image" }).lean();
  if (!photo) throw new Error(`Photo not found: ${PHOTO}`);

  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), section: section.title, theme: [section.settings?.theme, "light"], media: [section.media?.publicId ?? null, PHOTO] }));
  if (process.argv.includes("--apply")) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/honeymoon-section-${Date.now()}.json`, JSON.stringify(section, null, 2));
    const media = { mediaId: photo._id, publicId: photo.publicId, url: photo.secureUrl, resourceType: "image", format: photo.format, width: photo.width, height: photo.height, alt: ALT };
    const r = await PageSection.updateOne({ _id: section._id, updatedAt: section.updatedAt }, { $set: { media, "settings.theme": "light" } }, { runValidators: true });
    if (r.matchedCount !== 1) throw new Error("Section changed meanwhile; stopped. Backup kept.");
    revalidateFrontend(CACHE_TAGS.pages);
    // Give the cache refresh request time to finish before the process exits
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
