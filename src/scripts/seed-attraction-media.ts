/** Adds missing attraction cards/images. Dry run by default; --apply writes after a backup. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Destination } from "../models/Destination.js";
import { Media } from "../models/Media.js";
import { isCloudinaryConfigured, uploadImage } from "../services/cloudinary/cloudinary.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

interface AttractionImage {
  url: string;
  alt: string;
  resourceType: "image";
  width: number;
  height: number;
}
export interface AttractionEntry {
  title: string;
  description?: string;
  image?: { url?: string } | null;
  [key: string]: unknown;
}
interface ContentEntry extends AttractionEntry { image: AttractionImage }
interface Content { destinations: { slug: string; experiences: ContentEntry[] }[] }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const normalize = (title: string) => title.trim().toLowerCase().replace(/[’‘]/g, "'");

/** Never replaces an existing image, description, id, or card order. */
export function mergeAttractionMedia(existing: AttractionEntry[], additions: AttractionEntry[]) {
  const result = existing.map(item => ({ ...item }));
  for (const addition of additions) {
    const match = result.find(item => normalize(item.title) === normalize(addition.title));
    if (!match) result.push({ ...addition });
    else if (!match.image?.url?.trim() && addition.image?.url) match.image = addition.image;
  }
  return result;
}

export async function seedAttractionMedia(apply = false) {
  if (apply && env.NODE_ENV === "production") throw new Error("This content task targets the development site; production writes are disabled.");
  const content = JSON.parse(fs.readFileSync(path.join(root, "content/destination-attraction-media.json"), "utf8")) as Content;
  const publicRoot = path.resolve(root, "../frontend/public");
  // Fail before any database write if a bundled asset or responsive variant is missing.
  for (const destination of content.destinations) {
    for (const experience of destination.experiences) {
      const url = experience.image.url;
      if (!/^\/images\/editorial\/[a-z0-9/-]+\.webp$/.test(url)) throw new Error("Invalid bundled image path");
      for (const width of [0, 640, 1080]) {
        const variant = width ? url.replace(/\.webp$/, `-${width}.webp`) : url;
        if (!fs.existsSync(path.join(publicRoot, variant))) throw new Error(`Missing asset: ${variant}`);
      }
    }
  }

  const plans = [];
  for (const entry of content.destinations) {
    const current = await Destination.findOne({ slug: entry.slug }).lean();
    if (!current) throw new Error(`Destination not found: ${entry.slug}`);
    const before = (current.featuredExperiences ?? []) as unknown as AttractionEntry[];
    const after = mergeAttractionMedia(before, entry.experiences);
    if (JSON.stringify(before) !== JSON.stringify(after)) plans.push({ current, after });
  }
  console.log(`${apply ? "Apply" : "Dry run"}: ${plans.length} destination updates`);
  if (!apply || !plans.length) return plans.length;
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary is not configured for the requested attraction uploads.");

  const backupDir = path.join(root, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `attraction-media-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backup, JSON.stringify(plans.map(plan => plan.current), null, 2), { flag: "wx" });
  console.log("Saved destination backup before updates.");
  // CMS media fields require absolute URLs. Upload the bundled originals through the
  // site's existing service and register them in the Media picker, retaining AI alt text.
  const resolved = new Map<string, Awaited<ReturnType<typeof Media.findOne>>>();
  for (const { current, after } of plans) {
    for (const experience of after) {
      const image = experience.image as AttractionImage | null | undefined;
      if (!image?.url?.startsWith("/images/editorial/")) continue;
      const file = path.join(publicRoot, image.url);
      const digest = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      const sourceTag = `generated-attraction-${digest}`;
      let media = resolved.get(sourceTag) ?? await Media.findOne({ tags: sourceTag });
      if (!media) {
        console.log(`Uploading ${path.basename(file)}`);
        let uploaded;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            uploaded = await uploadImage(file, "destinations", { originalName: path.basename(file) });
            break;
          } catch (error) {
            const code = error && typeof error === "object" && "http_code" in error ? Number(error.http_code) : 0;
            if (attempt === 2 || (code && code !== 429 && code < 500)) {
              throw new Error(`Attraction upload failed: ${path.basename(file)} (HTTP ${code || "unavailable"})`, { cause: error });
            }
            console.log(`Retrying ${path.basename(file)}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
        if (!uploaded) throw new Error(`Attraction upload failed: ${path.basename(file)}`);
        media = await Media.create({ ...uploaded, title: experience.title, altText: image.alt,
          caption: "AI-generated illustrative destination attraction", tags: [sourceTag, "ai-generated", "attractions"] });
      }
      resolved.set(sourceTag, media);
      experience.image = { mediaId: media._id, publicId: media.publicId, url: media.secureUrl,
        resourceType: "image", format: media.format, width: media.width, height: media.height,
        alt: image.alt } as AttractionImage;
    }
    // A concurrent admin edit must not be overwritten by this content operation.
    const result = await Destination.updateOne(
      { _id: current._id, updatedAt: current.updatedAt },
      { $set: { featuredExperiences: after } },
      { runValidators: true },
    );
    if (result.matchedCount !== 1) throw new Error(`Concurrent edit detected: ${current.slug}; stopped. Backup retained.`);
    console.log(`Updated ${current.slug}`);
  }
  revalidateFrontend(CACHE_TAGS.destinations);
  return plans.length;
}

async function main() {
  try {
    await connectDatabase();
    await seedAttractionMedia(process.argv.includes("--apply"));
    await new Promise(resolve => setTimeout(resolve, 1500));
  } finally {
    await disconnectDatabase();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Only the explicit content errors above are suitable for terminal output.
    const message = error instanceof Error ? error.message : "";
    console.error(/^(Missing asset|Invalid bundled|Destination not found|Concurrent edit|This content task|Cloudinary is not configured|Attraction upload failed)/.test(message) ? message : "Attraction update failed; no credentials were logged. Check the database connection and content schema.");
    process.exitCode = 1;
  });
}
