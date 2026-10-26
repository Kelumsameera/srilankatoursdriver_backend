/**
 * Sets the tours page header video (stilt fishermen on the south coast) for every season –
 * it wins over the seasonal category videos. Change it in Admin → Pages → Tours → Header image.
 * Uploads the clip once (reused on later runs, e.g. against another database). Backs up first.
 * Usage: tsx src/scripts/set-tours-hero-video.ts <path-to-mp4>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Media } from "../models/Media.js";
import { Page } from "../models/Page.js";
import { folderPath, getResource, uploadVideo } from "../services/cloudinary/cloudinary.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const NAME = "tours-stilt-fishing";
const ALT = "Stilt fishermen on the south coast of Sri Lanka";
const file = process.argv[2];
if (!file) throw new Error("Usage: set-tours-hero-video.ts <path-to-mp4>");

await connectDatabase();

const page = await Page.findOne({ slug: "tours" }).lean();
if (!page) throw new Error("Tours page not found");
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/tours-hero-before-${Date.now()}.json`, JSON.stringify({ heroImage: page.heroImage ?? null }, null, 2));

const publicId = `${folderPath("hero")}/${NAME}`;
let media = await Media.findOne({ publicId, resourceType: "video" }).lean();
if (!media) {
  // Already on Cloudinary from a run against another database? Then only the Media record is missing.
  const uploaded = await getResource(publicId, "video").catch(() => uploadVideo(file, "hero", { publicId: NAME, originalName: path.basename(file) }));
  media = (await Media.create({ ...uploaded, title: "Tours page header", altText: ALT, tags: ["hero", "tours"] })).toObject();
}

const heroImage = { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "video", format: media.format, width: media.width, height: media.height, duration: media.duration, alt: ALT };
const r = await Page.updateOne({ _id: page._id, updatedAt: page.updatedAt }, { $set: { heroImage } }, { runValidators: true });
if (r.matchedCount !== 1) throw new Error("Tours page changed meanwhile; stopped. Backup kept.");
console.log(`tours page header video: ${media.secureUrl}`);

revalidateFrontend(CACHE_TAGS.pages);
await new Promise((resolve) => setTimeout(resolve, 2000));
await disconnectDatabase();
