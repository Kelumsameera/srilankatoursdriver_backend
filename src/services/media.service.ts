import fs from "node:fs/promises";
import mongoose from "mongoose";
import { Media } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId, escapeRegex } from "../utils/helpers.js";
import type { PaginationMeta } from "../utils/response.js";
import { logger } from "../config/logger.js";
import {
  deleteMedia,
  getResource,
  replaceMedia,
  uploadImage,
  uploadVideo,
  type MediaFolder,
  type ResourceType,
  type UploadedAsset,
} from "./cloudinary/index.js";
import { DIRECT_IMAGE_FORMATS, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_FORMATS, inspectUploadedFile, type InspectedFile } from "../middleware/upload.js";
import { env } from "../config/env.js";

interface MetaInput {
  title?: string;
  altText?: string;
  caption?: string;
  tags?: string[];
}

/** Checks metadata that Cloudinary reports for a *direct* browser upload (SVG is never allowed there). */
export function validateDirectAsset(asset: UploadedAsset): string | null {
  const formats = asset.resourceType === "video" ? VIDEO_FORMATS : DIRECT_IMAGE_FORMATS;
  const max = asset.resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  const format = (asset.format ?? "").toLowerCase();
  if (!format || !formats.includes(format)) return `Format .${format || "unknown"} is not allowed${format === "svg" ? " for direct uploads – upload SVG logos from Branding" : ""}`;
  if (asset.bytes > max) return `File exceeds the ${Math.round(max / 1024 / 1024)} MB limit`;
  return null;
}

async function persist(asset: UploadedAsset, meta: MetaInput, userId?: string) {
  const doc = await Media.findOneAndUpdate(
    { publicId: asset.publicId },
    {
      $set: {
        secureUrl: asset.secureUrl,
        resourceType: asset.resourceType,
        format: asset.format,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        bytes: asset.bytes,
        folder: asset.folder,
        version: asset.version,
        originalFilename: asset.originalFilename,
        ...(meta.title !== undefined ? { title: meta.title } : {}),
        ...(meta.altText !== undefined ? { altText: meta.altText } : {}),
        ...(meta.caption !== undefined ? { caption: meta.caption } : {}),
        ...(meta.tags !== undefined ? { tags: meta.tags } : {}),
      },
      $setOnInsert: { uploadedBy: userId },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
  return doc!;
}

/** Removes a freshly uploaded asset when saving its record failed, so Cloudinary is not left with an orphan. */
async function discardOrphan(asset: UploadedAsset) {
  await deleteMedia(asset.publicId, asset.resourceType).catch((err: unknown) =>
    logger.error({ err, publicId: asset.publicId }, "Could not remove orphaned Cloudinary asset"),
  );
}

/**
 * Registers an asset that the browser uploaded directly to Cloudinary with a server signature.
 * Metadata is re-fetched from Cloudinary (never trusted from the client) and validated.
 */
export async function registerDirectUpload(publicId: string, resourceType: ResourceType, meta: MetaInput, userId?: string) {
  const asset = await getResource(publicId, resourceType);
  const problem = validateDirectAsset(asset);
  const alreadyRegistered = await Media.exists({ publicId });
  if (problem) {
    if (!alreadyRegistered) await deleteMedia(publicId, resourceType).catch(() => undefined);
    throw ApiError.badRequest(problem);
  }
  try {
    return await persist(asset, { title: meta.title ?? asset.originalFilename, ...meta }, userId);
  } catch (err) {
    if (!alreadyRegistered) await discardOrphan(asset);
    throw err;
  }
}

/** Server-side upload of files received via multer. Every file is validated before anything is uploaded. */
export async function uploadFiles(files: Express.Multer.File[], folder: MediaFolder, meta: MetaInput, userId?: string) {
  const results = [];
  try {
    const checked: { file: Express.Multer.File; info: InspectedFile }[] = [];
    for (const file of files) checked.push({ file, info: await inspectUploadedFile(file, folder) });

    for (const { file, info } of checked) {
      const asset =
        info.resourceType === "video"
          ? await uploadVideo(file.path, folder, { originalName: file.originalname })
          : await uploadImage(file.path, folder, { originalName: file.originalname });
      try {
        results.push(await persist(asset, { title: meta.title || file.originalname.replace(/\.[^.]+$/, ""), ...meta }, userId));
      } catch (err) {
        await discardOrphan(asset);
        throw err;
      }
    }
  } finally {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => undefined)));
  }
  return results;
}

export async function listMedia(q: { page: number; limit: number; search?: string; resourceType?: string; folder?: string }) {
  const filter: Record<string, unknown> = {};
  if (q.resourceType) filter.resourceType = q.resourceType;
  if (q.folder) filter.folder = new RegExp(`/${escapeRegex(q.folder)}$`);
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ title: rx }, { originalFilename: rx }, { altText: rx }, { tags: rx }];
  }
  const [items, total] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Media.countDocuments(filter),
  ]);
  const meta: PaginationMeta = { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) };
  return { items, meta };
}

export async function getMedia(id: string) {
  assertObjectId(id);
  const doc = await Media.findById(id).lean();
  if (!doc) throw ApiError.notFound("Media not found");
  return doc;
}

export async function updateMediaMeta(id: string, meta: MetaInput) {
  assertObjectId(id);
  const doc = await Media.findByIdAndUpdate(id, { $set: meta }, { returnDocument: "after", runValidators: true }).lean();
  if (!doc) throw ApiError.notFound("Media not found");
  return doc;
}

/**
 * Replaces the file (keeps the same public id so every embedded reference keeps working).
 * The replacement goes through exactly the same validation as a new upload.
 */
export async function replaceMediaFile(id: string, file: Express.Multer.File) {
  try {
    const existing = await getMedia(id);
    const folder = String(existing.folder ?? "").split("/").pop() ?? "";
    const info = await inspectUploadedFile(file, folder || "general");
    if (existing.resourceType !== info.resourceType) throw ApiError.badRequest(`Replacement must also be a ${existing.resourceType}`);
    const asset = await replaceMedia(existing.publicId, file.path, existing.resourceType as ResourceType);
    return persist(asset, {}, undefined);
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
}

/* ───────────── Where is a media asset used? ───────────── */

const usagePathCache = new Map<string, string[]>();

/** Every path in a schema (including nested sub-documents and arrays) that stores a Cloudinary public id. */
interface WalkableSchema {
  eachPath(fn: (path: string, type: unknown) => void): unknown;
}
function publicIdPaths(schema: WalkableSchema, prefix = ""): string[] {
  const out: string[] = [];
  schema.eachPath((p, type) => {
    if (p === "publicId" || p.endsWith(".publicId")) out.push(`${prefix}${p}`);
    const sub = (type as { schema?: WalkableSchema }).schema;
    if (sub) out.push(...publicIdPaths(sub, `${prefix}${p}.`));
  });
  return out;
}

export interface MediaUsage {
  model: string;
  id: string;
  label: string;
}

/** Finds content that embeds this asset (tours, pages, branding, SEO …). */
export async function findMediaUsage(publicId: string, max = 20): Promise<MediaUsage[]> {
  const usages: MediaUsage[] = [];
  for (const name of mongoose.modelNames()) {
    if (name === "Media") continue;
    const model = mongoose.model(name);
    let paths = usagePathCache.get(name);
    if (!paths) {
      paths = publicIdPaths(model.schema as unknown as WalkableSchema);
      usagePathCache.set(name, paths);
    }
    if (paths.length === 0) continue;
    const docs = await model
      .find({ $or: paths.map((p) => ({ [p]: publicId })) })
      .select("title name label question guestName slug key type")
      .limit(max)
      .lean<Record<string, unknown>[]>();
    for (const d of docs) {
      const label = ["title", "name", "label", "question", "guestName", "slug", "key", "type"].map((k) => d[k]).find((v) => typeof v === "string" && v);
      usages.push({ model: name, id: String(d._id), label: String(label ?? d._id) });
    }
    if (usages.length >= max) break;
  }
  return usages.slice(0, max);
}

export async function getMediaUsage(id: string) {
  const doc = await getMedia(id);
  return findMediaUsage(doc.publicId);
}

/**
 * Deletes the Cloudinary asset first, then the record. If the record delete fails, retrying is safe
 * (Cloudinary answers "not found", which counts as success). Assets still used by content are only
 * deleted when `force` is set.
 */
export async function removeMedia(id: string, opts: { force?: boolean } = {}) {
  const doc = await getMedia(id);
  if (!opts.force) {
    const usage = await findMediaUsage(doc.publicId, 5);
    if (usage.length > 0) {
      throw ApiError.conflict(
        `This file is still used by ${usage.map((u) => `${u.model} “${u.label}”`).join(", ")}. Remove it there first, or delete anyway.`,
        usage.map((u) => ({ path: `${u.model}:${u.id}`, message: u.label })),
      );
    }
  }
  if (!doc.publicId.startsWith(`${env.CLOUDINARY_ROOT_FOLDER}/`)) throw ApiError.forbidden("Media does not belong to this site");
  await deleteMedia(doc.publicId, doc.resourceType as ResourceType);
  await Media.deleteOne({ _id: doc._id });
  return doc;
}
