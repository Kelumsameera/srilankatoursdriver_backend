import type { Request, Response } from "express";
import * as pages from "../services/pages.service.js";
import { logActivity } from "../services/activity.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
import { created, noContent, ok } from "../utils/response.js";

type AnyRecord = Record<string, unknown>;
const changed = () => revalidateFrontend(CACHE_TAGS.pages);
const pid = (req: Request) => String(req.params.id);
const sid = (req: Request) => String(req.params.sectionId);

export async function list(_req: Request, res: Response) {
  return ok(res, await pages.listPages());
}

export async function get(req: Request, res: Response) {
  return ok(res, await pages.getPageWithSections(pid(req)));
}

export async function create(req: Request, res: Response) {
  const page = await pages.createPage(req.validated?.body as AnyRecord, req.user?.id);
  await logActivity(req, { action: "create", entity: "page", entityId: String(page._id), summary: `Created page ${page.title}` });
  changed();
  return created(res, page, "Page created");
}

export async function update(req: Request, res: Response) {
  const page = await pages.updatePage(pid(req), req.validated?.body as AnyRecord, req.user?.id);
  await logActivity(req, { action: "update", entity: "page", entityId: String(page._id), summary: `Updated page ${page.title}` });
  changed();
  return ok(res, page, "Page saved");
}

export async function remove(req: Request, res: Response) {
  const page = await pages.deletePage(pid(req));
  await logActivity(req, { action: "delete", entity: "page", entityId: String(page._id), summary: `Deleted page ${page.title}` });
  changed();
  return noContent(res, "Page deleted");
}

export async function createSection(req: Request, res: Response) {
  const s = await pages.createSection(pid(req), req.validated?.body as AnyRecord);
  await logActivity(req, { action: "create", entity: "pageSection", entityId: String(s._id), summary: `Added ${s.type} section` });
  changed();
  return created(res, s, "Section added");
}

export async function updateSection(req: Request, res: Response) {
  const s = await pages.updateSection(pid(req), sid(req), req.validated?.body as AnyRecord);
  await logActivity(req, { action: "update", entity: "pageSection", entityId: String(s._id), summary: `Updated ${s.type} section` });
  changed();
  return ok(res, s, "Section saved");
}

export async function deleteSection(req: Request, res: Response) {
  const s = await pages.deleteSection(pid(req), sid(req));
  await logActivity(req, { action: "delete", entity: "pageSection", entityId: String(s._id), summary: `Deleted ${s.type} section` });
  changed();
  return noContent(res, "Section deleted");
}

export async function duplicateSection(req: Request, res: Response) {
  const s = await pages.duplicateSection(pid(req), sid(req));
  await logActivity(req, { action: "create", entity: "pageSection", entityId: String(s._id), summary: `Duplicated ${s.type} section` });
  changed();
  return created(res, s, "Section duplicated (disabled until you enable it)");
}

export async function reorderSections(req: Request, res: Response) {
  const { items } = req.validated?.body as { items: { id: string; order: number }[] };
  await pages.reorderSections(pid(req), items);
  await logActivity(req, { action: "reorder", entity: "pageSection", entityId: pid(req), summary: "Reordered sections" });
  changed();
  return ok(res, null, "Order saved");
}
