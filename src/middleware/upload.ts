import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
export const VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"];
export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "ico"];
export const VIDEO_FORMATS = ["mp4", "webm", "mov"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Server-side upload (fallback to direct signed uploads). Files are streamed to the OS temp
 * directory – never kept in memory or MongoDB – then pushed to Cloudinary and deleted.
 */
export const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `sltd-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 10 },
  fileFilter: (_req, file, cb) => {
    if ([...IMAGE_MIME, ...VIDEO_MIME].includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  },
});
