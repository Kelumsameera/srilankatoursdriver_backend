/** Add missing curated excursions without overwriting existing records. Dry-run by default. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Category, Destination, Excursion, Media } from "../models/index.js";
import { uploadImage } from "../services/cloudinary/cloudinary.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const apply = process.argv.includes("--apply");
if (apply && env.NODE_ENV !== "development") throw new Error("This content helper only writes in development.");
const content = JSON.parse(readFileSync(new URL("../../content/excursions.json", import.meta.url), "utf8")) as {
  excursions: Array<{ slug: string; title: string; categorySlug: string; destinationSlug: string; [key: string]: unknown }>;
};

await connectDatabase();
try {
  const before = await Excursion.find({ slug: { $in: content.excursions.map((e) => e.slug) } }).lean();
  if (apply) {
    const folder = new URL("../../backups/", import.meta.url);
    mkdirSync(folder, { recursive: true });
    writeFileSync(new URL(`excursions-before-${Date.now()}.json`, folder), JSON.stringify(before, null, 2));
  }
  for (const { categorySlug, destinationSlug, ...entry } of content.excursions) {
    const existing = await Excursion.findOne({ slug: entry.slug });
    if (existing && !existing.heroMedia?.url?.startsWith("/images/editorial/excursions/")) {
      console.log(`Unchanged: ${entry.slug} (already exists)`);
      continue;
    }
    // CMS media must use an absolute URL so it remains editable through the admin API.
    const hero = entry.heroMedia as { url: string; alt: string };
    if (apply && hero.url.startsWith("/images/editorial/excursions/")) {
      const tag = `curated-excursion-${entry.slug}-v2`;
      let media = await Media.findOne({ tags: tag });
      if (!media) {
        const file = fileURLToPath(new URL(`../../../frontend/public${hero.url}`, import.meta.url));
        const uploaded = await uploadImage(file, "excursions", { originalName: `${entry.slug}-v2.webp` });
        media = await Media.create({ ...uploaded, title: entry.title, altText: hero.alt, tags: [tag, "ai-generated", "excursions"] });
      }
      entry.heroMedia = { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "image", format: media.format, width: media.width, height: media.height, alt: hero.alt };
    }
    if (existing) {
      if (apply) await Excursion.updateOne({ _id: existing._id, "heroMedia.url": existing.heroMedia?.url }, { $set: { heroMedia: entry.heroMedia } }, { runValidators: true });
      console.log(`${apply ? "Resolved" : "Would resolve"}: ${entry.slug} CMS cover`);
      continue;
    }
    const category = await Category.findOne({ kind: "excursion", slug: categorySlug });
    const destination = await Destination.findOne({ slug: destinationSlug });
    if (!category || !destination) throw new Error(`Missing category or destination for ${entry.slug}`);
    const document = new Excursion({ ...entry, category: category._id, destination: destination._id, status: "published", order: 3 });
    await document.validate();
    if (apply) {
      // The unique slug and insert-only update also protect against concurrent runs.
      await Excursion.updateOne({ slug: entry.slug }, { $setOnInsert: document.toObject() }, { upsert: true, runValidators: true });
    }
    console.log(`${apply ? "Created" : "Would create"}: ${entry.slug}`);
  }
  if (apply) {
    revalidateFrontend(CACHE_TAGS.excursions);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await disconnectDatabase();
}
