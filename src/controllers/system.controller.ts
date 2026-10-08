import type { Request, Response } from "express";
import mongoose from "mongoose";
import { ActivityLog } from "../models/index.js";
import { getDashboardStats } from "../services/dashboard.service.js";
import { isCloudinaryConfigured } from "../services/cloudinary/index.js";
import { isEmailConfigured } from "../services/email/index.js";
import { isTranslationConfigured } from "../services/translation/index.js";
import { isTripAdvisorConfigured } from "../services/tripadvisor/tripadvisor.service.js";
import { PREVIEW_TOKEN_MINUTES, signPreviewToken } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { ok } from "../utils/response.js";
import { escapeRegex } from "../utils/helpers.js";

export async function dashboard(_req: Request, res: Response) {
  return ok(res, await getDashboardStats());
}

export async function activityLogs(req: Request, res: Response) {
  const q = req.validated?.query as { page: number; limit: number; search?: string; type?: string; from?: Date; to?: Date };
  const filter: Record<string, unknown> = {};
  if (q.type) filter.action = q.type;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ userEmail: rx }, { entity: rx }, { summary: rx }];
  }
  if (q.from || q.to) filter.timestamp = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ timestamp: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return ok(res, items, "OK", 200, { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
}

/** Integration status for Admin → System → API Settings. Never returns secret values. */
export async function integrations(_req: Request, res: Response) {
  return ok(res, {
    environment: env.NODE_ENV,
    database: { connected: mongoose.connection.readyState === 1, name: mongoose.connection.name },
    cloudinary: { configured: isCloudinaryConfigured(), cloudName: env.CLOUDINARY_CLOUD_NAME ?? null, rootFolder: env.CLOUDINARY_ROOT_FOLDER },
    email: { configured: isEmailConfigured(), host: env.SMTP_HOST ?? null, from: env.SMTP_FROM },
    translation: { configured: isTranslationConfigured(), provider: env.TRANSLATION_PROVIDER },
    tripadvisor: { configured: isTripAdvisorConfigured(), locationId: env.TRIPADVISOR_LOCATION_ID ?? null },
    revalidation: { configured: Boolean(env.REVALIDATE_SECRET), frontendUrl: env.FRONTEND_URL },
    security: {
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenDays: env.REFRESH_TOKEN_TTL_DAYS,
      cookieSameSite: env.COOKIE_SAMESITE,
      cookieDomain: env.COOKIE_DOMAIN ?? null,
    },
  });
}

export async function previewToken(req: Request, res: Response) {
  const { slug } = req.validated?.body as { slug: string };
  return ok(res, { token: signPreviewToken(req.user!.id, slug), expiresInMinutes: PREVIEW_TOKEN_MINUTES });
}
