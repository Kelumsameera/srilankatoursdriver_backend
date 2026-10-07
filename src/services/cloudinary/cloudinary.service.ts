import fs from "node:fs";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { IMAGE_FORMATS, VIDEO_FORMATS } from "../../middleware/upload.js";

export const MEDIA_FOLDERS = [
  "branding",
  "hero",
  "tours",
  "destinations",
  "excursions",
  "vehicles",
  "gallery",
  "blog",
  "guest-shorts",
  "reviews",
  "seo",
  "pages",
  "general",
] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];
export type ResourceType = "image" | "video";

export interface UploadedAsset {
  publicId: string;
  secureUrl: string;
  resourceType: ResourceType;
  format: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes: number;
  folder: string;
  originalFilename: string;
  version?: number;
}

let configured = false;

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function client() {
  if (!isCloudinaryConfigured()) {
    throw ApiError.unavailable(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the backend.",
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export function folderPath(folder: MediaFolder): string {
  return `${env.CLOUDINARY_ROOT_FOLDER}/${folder}`;
}

/** Ensures a public id belongs to this site's Cloudinary folder tree. */
export function assertOwnedPublicId(publicId: string): void {
  if (!publicId.startsWith(`${env.CLOUDINARY_ROOT_FOLDER}/`) || publicId.includes("..")) {
    throw ApiError.forbidden("Media does not belong to this site");
  }
}

function toAsset(r: UploadApiResponse, fallbackName = ""): UploadedAsset {
  return {
    publicId: r.public_id,
    secureUrl: r.secure_url,
    resourceType: r.resource_type === "video" ? "video" : "image",
    format: r.format ?? "",
    width: r.width,
    height: r.height,
    duration: typeof r.duration === "number" ? r.duration : undefined,
    bytes: r.bytes ?? 0,
    folder: r.asset_folder ?? r.folder ?? r.public_id.split("/").slice(0, -1).join("/"),
    originalFilename: r.original_filename ?? fallbackName,
    version: r.version,
  };
}

type Source = string | Buffer;

async function upload(source: Source, options: UploadApiOptions, originalName = ""): Promise<UploadedAsset> {
  const c = client();
  if (Buffer.isBuffer(source)) {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = c.uploader.upload_stream(options, (err, res) => (err || !res ? reject(err) : resolve(res)));
      stream.end(source);
    });
    return toAsset(result, originalName);
  }
  const isLargeVideo = options.resource_type === "video" && fs.existsSync(source) && fs.statSync(source).size > 90 * 1024 * 1024;
  const result = isLargeVideo
    ? ((await c.uploader.upload_large(source, { ...options, chunk_size: 20 * 1024 * 1024 })) as UploadApiResponse)
    : await c.uploader.upload(source, options);
  return toAsset(result, originalName);
}

export async function uploadImage(source: Source, folder: MediaFolder, opts: { publicId?: string; originalName?: string } = {}) {
  return upload(
    source,
    {
      resource_type: "image",
      folder: folderPath(folder),
      public_id: opts.publicId,
      use_filename: !opts.publicId,
      unique_filename: !opts.publicId,
      overwrite: Boolean(opts.publicId),
      allowed_formats: IMAGE_FORMATS,
    },
    opts.originalName,
  );
}

export async function uploadVideo(source: Source, folder: MediaFolder, opts: { publicId?: string; originalName?: string } = {}) {
  return upload(
    source,
    {
      resource_type: "video",
      folder: folderPath(folder),
      public_id: opts.publicId,
      use_filename: !opts.publicId,
      unique_filename: !opts.publicId,
      overwrite: Boolean(opts.publicId),
      allowed_formats: VIDEO_FORMATS,
    },
    opts.originalName,
  );
}

export async function deleteMedia(publicId: string, resourceType: ResourceType = "image"): Promise<boolean> {
  assertOwnedPublicId(publicId);
  const result = (await client().uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })) as {
    result?: string;
  };
  return result.result === "ok" || result.result === "not found";
}

/**
 * Replaces the binary behind an existing public id (same URL path, new version)
 * and invalidates CDN caches.
 */
export async function replaceMedia(publicId: string, source: Source, resourceType: ResourceType): Promise<UploadedAsset> {
  assertOwnedPublicId(publicId);
  return upload(source, {
    resource_type: resourceType,
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    allowed_formats: resourceType === "video" ? VIDEO_FORMATS : IMAGE_FORMATS,
  });
}

/** Fetches authoritative metadata for an asset (used to verify direct browser uploads). */
export async function getResource(publicId: string, resourceType: ResourceType): Promise<UploadedAsset> {
  assertOwnedPublicId(publicId);
  const r = (await client().api.resource(publicId, { resource_type: resourceType })) as UploadApiResponse;
  return toAsset(r);
}

/**
 * Signature for a direct, signed browser→Cloudinary upload. Only the signed parameters are
 * accepted by Cloudinary, so the browser cannot change the folder or allowed formats.
 * The API secret never leaves the server.
 */
export function generateUploadSignature(folder: MediaFolder, resourceType: ResourceType) {
  const c = client();
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder: folderPath(folder),
    allowed_formats: (resourceType === "video" ? VIDEO_FORMATS : IMAGE_FORMATS).join(","),
  };
  const signature = c.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET!);
  return {
    ...params,
    signature,
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
  };
}
