import type { Request, Response } from "express";
import * as pub from "../services/public.service.js";
import * as settings from "../services/settings.service.js";
import { getTripAdvisorSummary } from "../services/tripadvisor/tripadvisor.service.js";
import { verifyPreviewToken } from "../services/auth.service.js";
import { createPublicReview } from "../services/crm.service.js";
import { ok, created } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";
import { isLocale } from "../config/locales.js";

interface PublicQuery {
  locale?: string;
  page?: number;
  limit?: number;
  featured?: string;
  category?: string;
  destination?: string;
  search?: string;
  platform?: string;
  kind?: string;
  token?: string;
}

const q = (req: Request) => (req.validated?.query ?? {}) as PublicQuery;
const locale = (req: Request) => {
  const l = q(req).locale;
  return isLocale(l) ? l : undefined;
};

/** Public settings: never includes internal flags. */
export async function siteSettings(req: Request, res: Response) {
  const s = (await settings.getSiteSettings(locale(req))) as Record<string, unknown>;
  const { _id, __v, key, createdAt, ...rest } = s;
  void _id;
  void __v;
  void key;
  void createdAt;
  return ok(res, rest);
}

export async function branding(_req: Request, res: Response) {
  const b = (await settings.getBranding()) as Record<string, unknown>;
  const { _id, __v, key, createdAt, ...rest } = b;
  void _id;
  void __v;
  void key;
  void createdAt;
  return ok(res, rest);
}

export async function languages(_req: Request, res: Response) {
  return ok(res, await settings.listLanguages(true));
}

export async function navigation(req: Request, res: Response) {
  return ok(res, await pub.getNavigation(locale(req)));
}

export async function hero(req: Request, res: Response) {
  return ok(res, await pub.getActiveHeroSlides(locale(req)));
}

export async function page(req: Request, res: Response) {
  return ok(res, await pub.getPublicPage(String(req.params.slug), locale(req)));
}

/** Preview including disabled sections / draft pages, authorised by a short-lived admin token. */
export async function previewPage(req: Request, res: Response) {
  const token = q(req).token;
  if (!token || !verifyPreviewToken(token)) throw ApiError.unauthorized("Invalid or expired preview link");
  res.setHeader("Cache-Control", "no-store");
  return ok(res, await pub.getPublicPage(String(req.params.slug), locale(req), { preview: true }));
}

export function list(key: pub.PublicResourceKey) {
  return async (req: Request, res: Response) => {
    const query = q(req);
    const { items, meta } = await pub.listPublicLocalized(key, {
      locale: locale(req),
      page: query.page,
      limit: query.limit,
      featured: query.featured === "true",
      category: query.category,
      destination: query.destination,
      search: query.search,
      platform: query.platform,
    });
    return ok(res, items, "OK", 200, meta);
  };
}

export function detail(key: "tours" | "destinations" | "excursions" | "vehicles" | "blog") {
  return async (req: Request, res: Response) => ok(res, await pub.getPublicBySlug(key, String(req.params.slug), locale(req)));
}

export async function categories(req: Request, res: Response) {
  const kind = q(req).kind;
  if (!kind) throw ApiError.badRequest("kind is required");
  return ok(res, await pub.listCategories(kind, locale(req)));
}

export async function tripadvisor(_req: Request, res: Response) {
  return ok(res, await getTripAdvisorSummary());
}

export async function seo(req: Request, res: Response) {
  return ok(res, await pub.getSeo(String(req.params.key).toLowerCase()));
}

export async function sitemap(_req: Request, res: Response) {
  return ok(res, await pub.getSitemapData());
}

export async function submitReview(req: Request, res: Response) {
  await createPublicReview(req.validated?.body as Record<string, unknown>);
  return created(res, null, "Thank you! Your review will appear once it has been approved.");
}
