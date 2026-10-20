import fs from "node:fs";
import { z } from "zod";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Media, Tour } from "../models/index.js";
import { uploadImage } from "../services/cloudinary/index.js";
import { registerDirectUpload } from "../services/media.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const entries = z.array(z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  file: z.string().regex(/^illustrative-[a-z0-9-]+\.webp$/),
  alt: z.string().startsWith("AI-generated illustrative"),
  prompt: z.string(),
})).parse(JSON.parse(fs.readFileSync("content/tour-covers/generated-tour-covers.json", "utf8")));
if (new Set(entries.map((e) => e.slug)).size !== entries.length) throw new Error("Duplicate tour mapping");
for (const entry of entries) if (!fs.existsSync(`content/tour-covers/${entry.file}`)) throw new Error(`Missing image: ${entry.slug}`);
try {
  await connectDatabase();
  const tours = await Tour.find({ slug: { $in: entries.map((e) => e.slug) } }).lean();
  if (tours.length !== entries.length) throw new Error("Missing tours");
  const apply = process.argv.includes("--apply");
  console.log(JSON.stringify({ apply, covers: entries.map((e) => e.slug) }));
  if (apply) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/tours-before-distinct-covers-${Date.now()}.json`, JSON.stringify(tours, null, 2));
    for (const entry of entries) {
      const title = entry.file.replace(/\.webp$/, "");
      let media = await Media.findOne({ title }).lean();
      if (!media) {
        const asset = await uploadImage(fs.readFileSync(`content/tour-covers/${entry.file}`), "tours", { originalName: entry.file });
        media = (await registerDirectUpload(asset.publicId, "image", { title, altText: entry.alt,
          caption: "AI-generated travel illustration; not a photograph of a booked property or actual guests.",
          tags: ["tours", "illustrative", "ai-generated", entry.slug],
        }));
      }
      if (!media || media.resourceType !== "image") throw new Error(`Invalid media: ${entry.slug}`);
      const tour = tours.find((t) => t.slug === entry.slug)!;
      const heroMedia = { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "image",
        format: media.format, width: media.width, height: media.height, alt: entry.alt };
      const result = await Tour.updateOne({ _id: tour._id, updatedAt: tour.updatedAt }, { $set: { heroMedia } }, { runValidators: true });
      if (result.matchedCount !== 1) throw new Error(`Concurrent tour edit: ${entry.slug}`);
      console.log(JSON.stringify({ updated: entry.slug }));
    }
    // Keep the import manifest aligned with the covers now selected in the CMS.
    const mappingPath = "content/tour-image-mapping.json";
    const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as { slug: string; mediaId: string; alt: string; sourceLabel: string }[];
    for (const entry of entries) {
      const media = await Media.findOne({ title: entry.file.replace(/\.webp$/, "") }).lean();
      const row = mapping.find((m) => m.slug === entry.slug);
      if (media && row) Object.assign(row, { mediaId: String(media._id), alt: entry.alt, sourceLabel: "AI-generated travel illustration" });
    }
    fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
    revalidateFrontend(CACHE_TAGS.tours, CACHE_TAGS.pages);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally { await disconnectDatabase(); }
