import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
export const VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"];
export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "ico"];
export const VIDEO_FORMATS = ["mp4", "webm", "mov"];
/**
 * Formats a browser may upload *directly* to Cloudinary with a server signature.
 * SVG is excluded: its markup can carry scripts, so SVGs must go through the server
 * upload endpoint where their content is inspected.
 */
export const DIRECT_IMAGE_FORMATS = IMAGE_FORMATS.filter((f) => f !== "svg");
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_SVG_BYTES = 1024 * 1024;
/** SVG is only accepted for logos / favicons. */
export const SVG_ALLOWED_FOLDERS = ["branding"];

/**
 * What the file's bytes say it is (magic numbers), mapped to the MIME types and
 * extensions that are allowed to claim that content.
 */
const CONTENT_RULES: Record<string, { resourceType: "image" | "video"; mimes: string[]; exts: string[] }> = {
  jpeg: { resourceType: "image", mimes: ["image/jpeg"], exts: ["jpg", "jpeg"] },
  png: { resourceType: "image", mimes: ["image/png"], exts: ["png"] },
  gif: { resourceType: "image", mimes: ["image/gif"], exts: ["gif"] },
  webp: { resourceType: "image", mimes: ["image/webp"], exts: ["webp"] },
  avif: { resourceType: "image", mimes: ["image/avif"], exts: ["avif"] },
  ico: { resourceType: "image", mimes: ["image/x-icon", "image/vnd.microsoft.icon"], exts: ["ico"] },
  svg: { resourceType: "image", mimes: ["image/svg+xml"], exts: ["svg"] },
  // MP4 and QuickTime share the ISO-BMFF container; browsers label .mov files either way.
  isobmff: { resourceType: "video", mimes: ["video/mp4", "video/quicktime"], exts: ["mp4", "mov"] },
  webm: { resourceType: "video", mimes: ["video/webm"], exts: ["webm"] },
};

/** Identifies a file from its first bytes. Returns null for anything we do not accept. */
export function sniffContent(head: Buffer): keyof typeof CONTENT_RULES | null {
  const ascii = (start: number, end: number) => head.subarray(start, end).toString("latin1");
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (head.length >= 4 && head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return "ico";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (ascii(4, 8) === "ftyp") {
    const brands = ascii(8, Math.min(head.length, 64));
    if (/avi[fs]/.test(brands)) return "avif";
    if (/heic|heix|mif1|msf1/.test(ascii(8, 12))) return null; // HEIC etc. – not supported
    return "isobmff";
  }
  const text = head.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?<svg[\s>]/i.test(text) || (/^<\?xml/i.test(text) && /<svg[\s>]/i.test(text))) {
    return "svg";
  }
  return null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16) || 32))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Number(dec) || 32));
}

/**
 * Rejects SVG markup that could run code or pull in external resources when rendered.
 * Embedded raster images (data:image/png|jpeg|gif|webp) and internal "#id" references are allowed.
 */
export function assertSafeSvg(markup: string): void {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point here
  const text = decodeEntities(markup).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const problems: [RegExp, string][] = [
    [/<!ENTITY/i, "entity declarations"],
    [/<\s*script[\s>/]/i, "scripts"],
    [/<\s*(foreignObject|iframe|embed|object|audio|video|handler|listener)[\s>/]/i, "embedded documents"],
    [/\son[a-z]+\s*=/i, "event handler attributes"],
    [/(java|vb)script\s*:/i, "script URLs"],
    [/@import/i, "stylesheet imports"],
    [/url\(\s*['"]?\s*(?!#|data:image\/(png|jpe?g|gif|webp))/i, "external url() references"],
  ];
  for (const [rx, what] of problems) {
    if (rx.test(text)) throw ApiError.badRequest(`SVG rejected: it contains ${what}. Export a plain SVG or upload a PNG/WebP instead.`);
  }
  const hrefs = text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi);
  for (const [, , value] of hrefs) {
    const v = value.trim();
    if (v.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) continue;
    throw ApiError.badRequest("SVG rejected: it links to external resources. Export a self-contained SVG or upload a PNG/WebP instead.");
  }
}

export interface InspectedFile {
  resourceType: "image" | "video";
  format: string;
}

/**
 * Validates a received upload before it is sent to Cloudinary: extension, declared MIME type,
 * actual content (magic bytes), size limits and – for SVG – the markup itself.
 * The same checks apply to new uploads and to replacements.
 */
export async function inspectUploadedFile(file: Pick<Express.Multer.File, "path" | "originalname" | "mimetype" | "size">, folder?: string): Promise<InspectedFile> {
  const name = file.originalname || "file";
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!ext || ![...IMAGE_FORMATS, ...VIDEO_FORMATS].includes(ext)) {
    throw ApiError.badRequest(`${name}: file extension ${ext ? `.${ext}` : "(none)"} is not allowed`);
  }
  if (![...IMAGE_MIME, ...VIDEO_MIME].includes(file.mimetype)) throw ApiError.badRequest(`${name}: unsupported file type ${file.mimetype}`);
  if (!file.size) throw ApiError.badRequest(`${name} is empty`);

  const handle = await fs.open(file.path, "r");
  let head: Buffer;
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buf, 0, 512, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const kind = sniffContent(head);
  const rule = kind ? CONTENT_RULES[kind] : undefined;
  if (!kind || !rule) throw ApiError.badRequest(`${name}: file content is not a supported image or video`);
  if (!rule.mimes.includes(file.mimetype) || !rule.exts.includes(ext)) {
    throw ApiError.badRequest(`${name}: file content does not match its extension or type`);
  }

  const max = rule.resourceType === "video" ? MAX_VIDEO_BYTES : kind === "svg" ? MAX_SVG_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) throw ApiError.tooLarge(`${name} exceeds the ${Math.round(max / 1024 / 1024)} MB limit`);

  if (kind === "svg") {
    if (folder !== undefined && !SVG_ALLOWED_FOLDERS.includes(folder)) {
      throw ApiError.badRequest(`${name}: SVG files are only accepted for branding (logos and favicons)`);
    }
    assertSafeSvg(await fs.readFile(file.path, "utf8"));
  }
  return { resourceType: rule.resourceType, format: ext === "jpeg" ? "jpg" : ext };
}

/**
 * Server-side upload (fallback to direct signed uploads). Files are streamed to the OS temp
 * directory – never kept in memory or MongoDB – then pushed to Cloudinary and deleted.
 */
export const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `sltd-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 10, fields: 20, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    if ([...IMAGE_MIME, ...VIDEO_MIME].includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  },
});

/**
 * Deletes multer's temp files once the response is done – also when validation or an
 * earlier check fails before the service gets a chance to clean up.
 */
export function cleanupTempFiles(req: Request, res: Response, next: NextFunction) {
  res.on("close", () => {
    const files = [
      ...(Array.isArray(req.files) ? req.files : req.files ? Object.values(req.files).flat() : []),
      ...(req.file ? [req.file] : []),
    ];
    for (const f of files) void fs.unlink(f.path).catch(() => undefined);
  });
  next();
}
