/** Read-only inventory of every uploaded image and where it is used.
 * Run from backend/: npm run images:inventory  →  scripts/image-inventory.json
 * Never writes to MongoDB or Cloudinary. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

process.env.LOG_LEVEL = "silent";
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const INVENTORY_FILE = path.join(HERE, "image-inventory.json");

/** Collections that can embed media references ({ mediaId, publicId, url }). */
const CONTENT_COLLECTIONS = ["destinations", "tours", "excursions", "vehicles", "galleryitems", "heromedias", "blogposts", "categories", "pages", "pagesections", "brandsettings", "sitesettings", "guestshorts", "reviews"];

export interface InventoryImage {
  id: string;
  source: "media" | "embedded";
  url: string;
  publicId: string;
  filename: string;
  folder: string;
  alt: string;
  title: string;
  tags: string[];
  width?: number;
  height?: number;
  referencedBy: { collection: string; id: string; label: string; field: string }[];
}

type AnyRecord = Record<string, unknown>;

/** Walks a document and yields every embedded media asset with its field path. */
function* assets(value: unknown, field = ""): Generator<{ field: string; asset: AnyRecord }> {
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* assets(v, `${field}[${i}]`);
  } else if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    const o = value as AnyRecord;
    if (typeof o.url === "string" && (o.mediaId || o.publicId) && o.resourceType !== "video") yield { field, asset: o };
    for (const [k, v] of Object.entries(o)) if (k !== "_id") yield* assets(v, field ? `${field}.${k}` : k);
  }
}

async function main() {
  const { env } = await import("../src/config/env.js");
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const db = mongoose.connection.db!;

  const images = new Map<string, InventoryImage>();
  const byUrl = new Map<string, string>();
  const byPublicId = new Map<string, string>();
  const media = await db.collection("media").find({ resourceType: "image" }).toArray();
  for (const m of media) {
    const id = String(m._id);
    images.set(id, {
      id,
      source: "media",
      url: String(m.secureUrl ?? ""),
      publicId: String(m.publicId ?? ""),
      filename: String(m.originalFilename || path.basename(String(m.publicId ?? ""))),
      folder: String(m.folder ?? ""),
      alt: String(m.altText ?? ""),
      title: String(m.title ?? ""),
      tags: (m.tags as string[] | undefined) ?? [],
      width: m.width as number | undefined,
      height: m.height as number | undefined,
      referencedBy: [],
    });
    byUrl.set(String(m.secureUrl), id);
    byPublicId.set(String(m.publicId), id);
  }

  for (const name of CONTENT_COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      const label = String(doc.slug ?? doc.name ?? doc.title ?? doc.key ?? doc._id);
      for (const { field, asset } of assets(doc)) {
        const id =
          (asset.mediaId && images.has(String(asset.mediaId)) ? String(asset.mediaId) : undefined) ??
          byPublicId.get(String(asset.publicId)) ??
          byUrl.get(String(asset.url));
        const ref = { collection: name, id: String(doc._id), label, field };
        if (id) {
          images.get(id)!.referencedBy.push(ref);
          continue;
        }
        // Embedded asset without a Media record (e.g. imported by a migration).
        const key = `embedded:${asset.publicId || asset.url}`;
        if (!images.has(key)) {
          images.set(key, {
            id: key,
            source: "embedded",
            url: String(asset.url),
            publicId: String(asset.publicId ?? ""),
            filename: path.basename(String(asset.publicId || asset.url)).replace(/\.[a-z0-9]+$/i, ""),
            folder: "",
            alt: String(asset.alt ?? ""),
            title: "",
            tags: [],
            referencedBy: [],
          });
        }
        images.get(key)!.referencedBy.push(ref);
      }
    }
  }

  const list = [...images.values()];
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, images: list }, null, 2));
  const unused = list.filter((i) => i.referencedBy.length === 0).length;
  console.log(`Inventory: ${list.length} images (${unused} not referenced anywhere) → ${path.relative(process.cwd(), INVENTORY_FILE)}`);
  await mongoose.disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message.replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>") : err);
  await mongoose.disconnect();
  process.exit(1);
});
