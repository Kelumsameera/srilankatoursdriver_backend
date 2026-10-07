import type { Request, Response } from "express";
import * as settings from "../services/settings.service.js";
import { logActivity } from "../services/activity.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
import { ok } from "../utils/response.js";

type AnyRecord = Record<string, unknown>;

export async function getSiteSettings(_req: Request, res: Response) {
  return ok(res, await settings.getSiteSettings());
}

export async function updateSiteSettings(req: Request, res: Response) {
  const doc = await settings.updateSiteSettings(req.validated?.body as AnyRecord);
  await logActivity(req, { action: "settings_update", entity: "siteSetting", entityId: String(doc._id), summary: "Updated site settings" });
  revalidateFrontend(CACHE_TAGS.settings);
  return ok(res, doc, "Site settings saved");
}

export async function getBranding(_req: Request, res: Response) {
  return ok(res, await settings.getBranding());
}

export async function updateBranding(req: Request, res: Response) {
  const doc = await settings.updateBranding(req.validated?.body as AnyRecord);
  await logActivity(req, { action: "settings_update", entity: "brandSetting", entityId: String(doc._id), summary: "Updated branding" });
  revalidateFrontend(CACHE_TAGS.branding);
  return ok(res, doc, "Branding saved");
}

export async function listLanguages(_req: Request, res: Response) {
  return ok(res, await settings.listLanguages());
}

export async function updateLanguages(req: Request, res: Response) {
  const { languages } = req.validated?.body as { languages: { code: string; enabled: boolean; order?: number }[] };
  const rows = await settings.updateLanguages(languages);
  await logActivity(req, { action: "settings_update", entity: "language", summary: "Updated enabled languages" });
  revalidateFrontend(CACHE_TAGS.languages);
  return ok(res, rows, "Languages saved");
}
