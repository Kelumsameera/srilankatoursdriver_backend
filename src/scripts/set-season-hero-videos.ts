/**
 * Sets the tours page header video of each seasonal tour category (shown while it is in season).
 * Down South: the Mirissa south coast clip. East Coast: the aerial beach clip until a real
 * east coast video is uploaded – change either in Admin → Tour categories. Backs up first.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category } from "../models/Category.js";
import { Media } from "../models/Media.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const VIDEOS: Record<string, { publicId: string; alt: string }> = {
  "down-south-tours": { publicId: "srilankatoursdriver/hero/zip-heromirissa", alt: "Mirissa, south coast of Sri Lanka" },
  "east-coast-tours": { publicId: "srilankatoursdriver/hero/yssj1pmjrstbqikja3tp", alt: "Aerial view of a Sri Lankan beach" },
};

await connectDatabase();

const before = await Category.find({ kind: "tour", slug: { $in: Object.keys(VIDEOS) } }).select("slug heroVideo").lean();
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/season-hero-videos-before-${Date.now()}.json`, JSON.stringify(before, null, 2));

for (const [slug, v] of Object.entries(VIDEOS)) {
  const m = await Media.findOne({ publicId: v.publicId, resourceType: "video" }).lean();
  if (!m) throw new Error(`Video not found: ${v.publicId}`);
  const heroVideo = { mediaId: m._id, publicId: m.publicId, url: m.secureUrl, resourceType: "video", format: m.format, width: m.width, height: m.height, duration: m.duration, alt: v.alt };
  const r = await Category.updateOne({ kind: "tour", slug }, { $set: { heroVideo } });
  console.log(r.matchedCount ? `${slug}: ${v.publicId}` : `${slug}: category not found`);
}

revalidateFrontend(CACHE_TAGS.categories);
await new Promise((resolve) => setTimeout(resolve, 2000));
await disconnectDatabase();
