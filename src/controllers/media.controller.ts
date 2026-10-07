import type { Request, Response } from "express";
import * as media from "../services/media.service.js";
import { generateUploadSignature, isCloudinaryConfigured, type MediaFolder, type ResourceType } from "../services/cloudinary/index.js";
import { logActivity } from "../services/activity.service.js";
import { created, noContent, ok } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

type Meta = { title?: string; altText?: string; caption?: string; tags?: string[] };

export async function list(req: Request, res: Response) {
  const { items, meta } = await media.listMedia(req.validated?.query as Parameters<typeof media.listMedia>[0]);
  return ok(res, items, "OK", 200, meta);
}

export async function get(req: Request, res: Response) {
  return ok(res, await media.getMedia(String(req.params.id)));
}

/** Lets the admin UI warn early when media storage isn't set up (no secrets returned). */
export async function status(_req: Request, res: Response) {
  return ok(res, { configured: isCloudinaryConfigured() });
}

export async function signature(req: Request, res: Response) {
  const { folder, resourceType } = req.validated?.body as { folder: MediaFolder; resourceType: ResourceType };
  return ok(res, generateUploadSignature(folder, resourceType));
}

export async function register(req: Request, res: Response) {
  const body = req.validated?.body as { publicId: string; resourceType: ResourceType } & Meta;
  const doc = await media.registerDirectUpload(body.publicId, body.resourceType, body, req.user?.id);
  await logActivity(req, { action: "media_upload", entity: "media", entityId: String(doc._id), summary: `Uploaded ${doc.resourceType} ${doc.publicId}` });
  return created(res, doc, "Media saved");
}

export async function upload(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw ApiError.badRequest("No files received (field name: files)");
  const { folder, ...meta } = req.validated?.body as { folder: MediaFolder } & Meta;
  const docs = await media.uploadFiles(files, folder, meta, req.user?.id);
  for (const d of docs) {
    await logActivity(req, { action: "media_upload", entity: "media", entityId: String(d._id), summary: `Uploaded ${d.resourceType} ${d.publicId}` });
  }
  return created(res, docs, `${docs.length} file(s) uploaded`);
}

export async function update(req: Request, res: Response) {
  const doc = await media.updateMediaMeta(String(req.params.id), req.validated?.body as Meta);
  await logActivity(req, { action: "update", entity: "media", entityId: String(doc._id), summary: "Edited media details" });
  return ok(res, doc, "Media updated");
}

export async function replace(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw ApiError.badRequest("No file received (field name: file)");
  const doc = await media.replaceMediaFile(String(req.params.id), file);
  await logActivity(req, { action: "media_upload", entity: "media", entityId: String(doc._id), summary: `Replaced file for ${doc.publicId}` });
  return ok(res, doc, "File replaced");
}

export async function remove(req: Request, res: Response) {
  const doc = await media.removeMedia(String(req.params.id));
  await logActivity(req, { action: "media_delete", entity: "media", entityId: String(doc._id), summary: `Deleted ${doc.publicId}` });
  return noContent(res, "Media deleted");
}
