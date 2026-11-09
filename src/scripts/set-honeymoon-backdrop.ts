/** Replace the homepage honeymoon backdrop in development; preserve the previous section. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Media, PageSection } from "../models/index.js";
import { uploadImage } from "../services/cloudinary/cloudinary.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

if (env.NODE_ENV !== "development") throw new Error("This helper only writes in development.");
await connectDatabase();
try {
  const section = await PageSection.findOne({ name: "Home honeymoon-tours", type: "popularTours" });
  if (!section) throw new Error("Homepage honeymoon section not found");
  const folder = new URL("../../backups/", import.meta.url);
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL(`honeymoon-backdrop-before-${Date.now()}.json`, folder), JSON.stringify(section.toObject(), null, 2));
  const tag = "homepage-honeymoon-couple-v2";
  let media = await Media.findOne({ tags: tag });
  if (!media) {
    const file = fileURLToPath(new URL("../../../frontend/public/images/editorial/honeymoon-beach-couple-v2.webp", import.meta.url));
    const asset = await uploadImage(file, "pages", { originalName: "honeymoon-beach-couple-v2.webp" });
    media = await Media.create({ ...asset, title: "Sri Lanka honeymoon beach sunset", altText: "AI-generated illustrative image of a honeymoon couple walking hand in hand on a tropical Sri Lankan beach at sunset", tags: [tag, "ai-generated", "honeymoon"] });
  }
  section.set("media", { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "image", format: media.format, width: media.width, height: media.height, alt: media.altText });
  section.set("settings.backdropFocus", "bottom");
  await section.save();
  revalidateFrontend(CACHE_TAGS.pages);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(`Updated honeymoon backdrop: ${media.width}x${media.height}; other homepage sections preserved.`);
} finally {
  await disconnectDatabase();
}
