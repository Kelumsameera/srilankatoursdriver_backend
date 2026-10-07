import fs from "node:fs/promises";
import { Media } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId, escapeRegex } from "../utils/helpers.js";
import type { PaginationMeta } from "../utils/response.js";
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
import { IMAGE_FORMATS, IMAGE_MIME, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_FORMATS, VIDEO_MIME } from "../middleware/upload.js";

interface MetaInput {
  title?: string;
  altText?: string;
  caption?: string;
  tags?: string[];
}

function validateAsset(asset: UploadedAsset) {
  const formats = asset.resourceType === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;
  const max = asset.resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (asset.format && !formats.includes(asset.format.toLowerCase())) return `Format .${asset.format} is not allowed`;
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
    { upsert: true, returnDocument: "after" },
  ).lean();
  return doc!;
}

/**
 * Registers an asset that the browser uploaded directly to Cloudinary with a server signature.
 * Metadata is re-fetched from Cloudinary (never trusted from the client) and validated.
 */
export async function registerDirectUpload(publicId: string, resourceType: ResourceType, meta: MetaInput, userId?: string) {
  const asset = await getResource(publicId, resourceType);
  const problem = validateAsset(asset);
  if (problem) {
    await deleteMedia(publicId, resourceType).catch(() => undefined);
    throw ApiError.badRequest(problem);
  }
  return persist(asset, { title: meta.title ?? asset.originalFilename, ...meta }, userId);
}

/** Server-side upload of files received via multer (temp files are always removed). */
export async function uploadFiles(files: Express.Multer.File[], folder: MediaFolder, meta: MetaInput, userId?: string) {
  const results = [];
  try {
    for (const file of files) {
      const isVideo = VIDEO_MIME.includes(file.mimetype);
      if (!isVideo && !IMAGE_MIME.includes(file.mimetype)) throw ApiError.badRequest(`Unsupported file type: ${file.mimetype}`);
      if (!isVideo && file.size > MAX_IMAGE_BYTES) throw ApiError.tooLarge(`${file.originalname} exceeds the image size limit (15 MB)`);
      const asset = isVideo
        ? await uploadVideo(file.path, folder, { originalName: file.originalname })
        : await uploadImage(file.path, folder, { originalName: file.originalname });
      results.push(await persist(asset, { title: meta.title || file.originalname.replace(/\.[^.]+$/, ""), ...meta }, userId));
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

/** Replaces the file (keeps the same public id so every embedded reference keeps working). */
export async function replaceMediaFile(id: string, file: Express.Multer.File) {
  try {
    const existing = await getMedia(id);
    const isVideo = VIDEO_MIME.includes(file.mimetype);
    if ((existing.resourceType === "video") !== isVideo) throw ApiError.badRequest(`Replacement must also be a ${existing.resourceType}`);
    const asset = await replaceMedia(existing.publicId, file.path, existing.resourceType as ResourceType);
    return persist(asset, {}, undefined);
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
}

export async function removeMedia(id: string) {
  const doc = await getMedia(id);
  await deleteMedia(doc.publicId, doc.resourceType as ResourceType);
  await Media.deleteOne({ _id: doc._id });
  return doc;
}
