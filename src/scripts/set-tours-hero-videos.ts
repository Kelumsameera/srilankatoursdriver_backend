import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Media, Page } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

// Tours page header videos that take turns (stilt fishing first). Change them in Admin → Pages → Tours → Header videos.
// Dry run by default; add --apply to write (a backup of the old list is saved first).
const VIDEOS = [
  { publicId: "srilankatoursdriver/hero/tours-stilt-fishing", alt: "Stilt fishermen on the south coast of Sri Lanka" },
  { publicId: "srilankatoursdriver/hero/yssj1pmjrstbqikja3tp", alt: "Aerial view of a Sri Lankan beach" },
  { publicId: "srilankatoursdriver/hero/j1n9ysodfmxjikqesvui", alt: "Misty hills and the Nine Arch Bridge, Ella" },
  { publicId: "srilankatoursdriver/hero/zip-heromirissa", alt: "Mirissa, south coast of Sri Lanka" },
];

try {
  await connectDatabase();
  const page = await Page.findOne({ slug: "tours" }).lean();
  if (!page) throw new Error("Tours page missing");
  const heroVideos = [];
  for (const v of VIDEOS) {
    const m = await Media.findOne({ publicId: v.publicId, resourceType: "video" }).lean();
    if (!m) throw new Error(`Video not found: ${v.publicId}`);
    heroVideos.push({ mediaId: m._id, publicId: m.publicId, url: m.secureUrl, resourceType: "video", format: m.format, width: m.width, height: m.height, duration: m.duration, alt: v.alt });
  }

  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), from: (page.heroVideos ?? []).map((v) => v.publicId), to: VIDEOS.map((v) => v.publicId) }));
  if (process.argv.includes("--apply")) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/tours-hero-videos-${Date.now()}.json`, JSON.stringify({ heroVideos: page.heroVideos ?? [] }, null, 2));
    const r = await Page.updateOne({ _id: page._id, updatedAt: page.updatedAt }, { $set: { heroVideos } }, { runValidators: true });
    if (r.matchedCount !== 1) throw new Error("Tours page changed meanwhile; stopped. Backup kept.");
    revalidateFrontend(CACHE_TAGS.pages);
    // Give the cache refresh request time to finish before the process exits
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
