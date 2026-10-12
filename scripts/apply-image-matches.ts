/** Applies the reviewed scripts/image-mapping.json to destinations.
 * Run from backend/:  npm run images:apply -- --dry-run     (always do this first)
 *                     npm run images:apply                  (writes; backs up destinations first)
 *                     npm run images:apply -- --force       (also replaces a hero/attraction image that is already set)
 * Mapping format: { "<slug>": { "hero": "<image>", "gallery": ["<image>"], "attractions": { "<name>": "<image>" } } }
 * where <image> is a Media id, a Cloudinary publicId or an image URL from scripts/image-inventory.json.
 * Idempotent: values that already match are skipped. Never deletes or modifies Media documents or files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

process.env.LOG_LEVEL = "silent";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPPING = path.join(HERE, "image-mapping.json");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

type AnyRecord = Record<string, unknown>;
type Mapping = Record<string, { hero?: string | null; gallery?: string[]; attractions?: Record<string, string | null> }>;

async function main() {
  if (!fs.existsSync(MAPPING)) throw new Error("scripts/image-mapping.json not found – run `npm run images:match` and review it first.");
  const mapping = JSON.parse(fs.readFileSync(MAPPING, "utf8")) as Mapping;

  const { env } = await import("../src/config/env.js");
  const { Destination } = await import("../src/models/index.js");
  const { Media } = await import("../src/models/Media.js");
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const inventoryFile = path.join(HERE, "image-inventory.json");
  const inventory = fs.existsSync(inventoryFile) ? (JSON.parse(fs.readFileSync(inventoryFile, "utf8")).images as AnyRecord[]) : [];

  /** Resolves a mapping value to an embeddable media asset, or null if it cannot be found. */
  const resolve = async (ref: string, alt: string): Promise<AnyRecord | null> => {
    const m = (await Media.findOne(mongoose.isValidObjectId(ref) ? { _id: ref } : { $or: [{ publicId: ref }, { secureUrl: ref }] }).lean()) as AnyRecord | null;
    if (m) {
      if (m.resourceType !== "image") return null;
      return { mediaId: m._id, publicId: m.publicId, url: m.secureUrl, resourceType: "image", format: m.format, width: m.width, height: m.height, alt };
    }
    // Embedded-only images from the inventory (no Media record).
    const e = inventory.find((i) => i.id === ref || i.url === ref || i.publicId === ref);
    return e ? { publicId: e.publicId || undefined, url: e.url, resourceType: "image", alt } : null;
  };
  const same = (a?: AnyRecord | null, b?: AnyRecord | null) => Boolean(a?.url && b?.url && a.url === b.url);

  if (!dryRun) {
    const dir = path.join(HERE, "../backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `destinations-before-images-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(await Destination.find({ slug: { $in: Object.keys(mapping) } }).lean(), null, 2));
    console.log(`Backup → ${path.relative(process.cwd(), file)}`);
  }

  let changed = 0;
  for (const [slug, entry] of Object.entries(mapping)) {
    const doc = (await Destination.findOne({ slug }).lean()) as AnyRecord | null;
    if (!doc) {
      console.warn(`! ${slug}: destination not found – skipped`);
      continue;
    }
    const set: AnyRecord = {};
    const notes: string[] = [];

    if (entry.hero) {
      const asset = await resolve(entry.hero, String(doc.name));
      const current = doc.heroMedia as AnyRecord | undefined;
      if (!asset) notes.push(`hero "${entry.hero}" not found`);
      else if (same(current, asset)) void 0;
      else if (current?.url && !force) notes.push("hero already set (use --force to replace)");
      else set.heroMedia = asset;
    }

    if (entry.gallery?.length) {
      const current = ((doc.gallery as AnyRecord[] | undefined) ?? []).map((g) => g.url);
      const next = [...((doc.gallery as AnyRecord[] | undefined) ?? [])];
      for (const [i, ref] of entry.gallery.entries()) {
        const asset = await resolve(ref, `${doc.name} – ${i + 1}`);
        if (!asset) notes.push(`gallery "${ref}" not found`);
        else if (!current.includes(asset.url)) next.push(asset); // append only; existing gallery items are kept
      }
      if (next.length !== current.length) set.gallery = next;
    }

    const experiences = ((doc.featuredExperiences as AnyRecord[] | undefined) ?? []).map((e) => ({ ...e }));
    let experiencesChanged = false;
    for (const [name, ref] of Object.entries(entry.attractions ?? {})) {
      if (!ref) continue;
      const exp = experiences.find((e) => String(e.title).toLowerCase() === name.toLowerCase());
      if (!exp) {
        notes.push(`attraction "${name}" not on the destination`);
        continue;
      }
      const asset = await resolve(ref, name);
      if (!asset) notes.push(`image for "${name}" not found`);
      else if (same(exp.image as AnyRecord, asset)) void 0;
      else if ((exp.image as AnyRecord | undefined)?.url && !force) notes.push(`"${name}" already has an image`);
      else {
        exp.image = asset;
        experiencesChanged = true;
      }
    }
    if (experiencesChanged) set.featuredExperiences = experiences;

    const keys = Object.keys(set);
    if (keys.length) {
      changed++;
      console.log(`~ ${slug}: ${keys.join(", ")}${dryRun ? " (dry run)" : ""}`);
      if (!dryRun) await Destination.updateOne({ _id: doc._id }, { $set: set }, { runValidators: true });
    }
    for (const n of notes) console.log(`  · ${slug}: ${n}`);
  }
  console.log(`${dryRun ? "[dry run] " : ""}${changed} destination(s) ${dryRun ? "would change" : "updated"}`);
  if (!dryRun && changed) {
    const { CACHE_TAGS, revalidateFrontend } = await import("../src/services/revalidate.service.js");
    revalidateFrontend(CACHE_TAGS.destinations);
    await new Promise((r) => setTimeout(r, 1500));
  }
  await mongoose.disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message.replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>") : err);
  await mongoose.disconnect();
  process.exit(1);
});
