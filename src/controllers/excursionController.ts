import type { NextFunction, Request, Response } from "express";
import { getPublicBySlug, listPublicLocalized } from "../services/public.service.js";
import { ok } from "../utils/response.js";
import { readLocale, readQuery } from "./publicRequest.js";

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
