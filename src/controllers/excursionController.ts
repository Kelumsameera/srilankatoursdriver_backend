import type { NextFunction, Request, Response } from "express";
import { getPublicBySlug, listPublicLocalized } from "../services/public.service.js";
import { isLocale } from "../config/locales.js";
import { ok } from "../utils/response.js";
import type { PublicQuery } from "../validations/public.js";

// The query string after the validate() middleware has checked it
function readQuery(req: Request) {
  return (req.validated?.query ?? {}) as PublicQuery;
}

// ?locale=de -> "de". Unknown locales mean "use the original English text"
function readLocale(req: Request) {
  const locale = readQuery(req).locale;
  return isLocale(locale) ? locale : undefined;
}

// GET /api/excursions - list published excursions (filters: featured, category, destination, search; paged)
export async function getExcursions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = readQuery(req);
    const result = await listPublicLocalized("excursions", {
      locale: readLocale(req),
      page: query.page,
      limit: query.limit,
      featured: query.featured === "true",
      category: query.category,
      destination: query.destination,
      search: query.search ?? query.q,
      platform: query.platform,
    });
    ok(res, result.items, "OK", 200, result.meta);
  } catch (error) {
    // The shared error handler sends the same error JSON as every other route
    next(error);
  }
}

// GET /api/excursions/:slug - one published excursion, translated when ?locale= is set
export async function getExcursionBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const excursion = await getPublicBySlug("excursions", String(req.params.slug), readLocale(req));
    ok(res, excursion);
  } catch (error) {
    next(error);
  }
}
