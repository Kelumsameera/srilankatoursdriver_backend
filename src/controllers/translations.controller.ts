import type { Request, Response } from "express";
import * as tr from "../services/translation/index.js";
import { logActivity } from "../services/activity.service.js";
import { ok } from "../utils/response.js";
import { LOCALE_META, SOURCE_LOCALE, TARGET_LOCALES } from "../config/locales.js";
import { env } from "../config/env.js";

export async function overview(req: Request, res: Response) {
  const { type } = req.validated?.query as { type?: string };
  return ok(res, {
    provider: env.TRANSLATION_PROVIDER,
    configured: tr.isTranslationConfigured(),
    sourceLocale: SOURCE_LOCALE,
    locales: TARGET_LOCALES.map((code) => ({ code, ...LOCALE_META[code] })),
    entityTypes: Object.entries(tr.TRANSLATABLE).map(([key, v]) => ({ key, label: v.label })),
    groups: await tr.getStatusOverview(type),
  });
}

export async function getEntity(req: Request, res: Response) {
  return ok(res, await tr.getEntityTranslations(String(req.params.entityType), String(req.params.entityId)));
}

/**
 * One item: translated before responding (200).
 * A whole content type: too slow for one request, so a background job starts and 202 returns the
 * job for polling (GET /admin/translations/jobs/:id).
 */
export async function generate(req: Request, res: Response) {
  const body = req.validated?.body as { entityType: string; entityId?: string; locales?: string[]; force?: boolean };
  const forLocales = body.locales?.length ? ` (${body.locales.join(", ")})` : "";

  if (!body.entityId) {
    const job = await tr.startBulkTranslation(body.entityType, body.locales, req.user?.id);
    await logActivity(req, { action: "translate", entity: body.entityType, summary: `Started translating all ${body.entityType} items${forLocales}` });
    return ok(res, job, "Translation started", 202);
  }

  const result = await tr.generateTranslations({ entityType: body.entityType, entityId: body.entityId, locales: body.locales, force: body.force, userId: req.user?.id });
  await logActivity(req, {
    action: "translate",
    entity: body.entityType,
    entityId: body.entityId,
    summary: `${body.force ? "Regenerated" : "Generated"} translations${forLocales}`,
  });
  return ok(res, result, "Translation finished");
}

export async function job(req: Request, res: Response) {
  return ok(res, await tr.getBulkTranslationJob(String(req.params.id)));
}

export async function save(req: Request, res: Response) {
  const { entityType, entityId, locale } = req.params as Record<string, string>;
  const row = await tr.saveManualTranslation(entityType, entityId, locale, req.validated?.body as Parameters<typeof tr.saveManualTranslation>[3], req.user?.id);
  await logActivity(req, { action: "translate", entity: entityType, entityId, summary: `Edited ${locale} translation` });
  return ok(res, row, "Translation saved");
}
