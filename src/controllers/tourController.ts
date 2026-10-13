import type { NextFunction, Request, Response } from "express";
import { getPublicBySlug, listPublicLocalized } from "../services/public.service.js";
import { ok } from "../utils/response.js";
import { readLocale, readQuery } from "./publicRequest.js";

// GET /api/tours - list published tours (filters: featured, category, destination, search; paged)
export async function getTours(req: Request, res: Response, next: NextFunction) {
  try {
    const query = readQuery(req);
    const result = await listPublicLocalized("tours", {
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

// GET /api/tours/:slug - one published tour, translated when ?locale= is set
export async function getTourBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const tour = await getPublicBySlug("tours", String(req.params.slug), readLocale(req));
    ok(res, tour);
  } catch (error) {
    next(error);
  }
}
