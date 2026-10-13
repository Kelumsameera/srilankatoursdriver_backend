import type { NextFunction, Request, Response } from "express";
import { getPublicBySlug, listPublicLocalized } from "../services/public.service.js";
import { ok } from "../utils/response.js";
import { readLocale, readQuery } from "./publicRequest.js";

// GET /api/vehicles - list published vehicles (filters: featured, category, destination, search; paged)
export async function getVehicles(req: Request, res: Response, next: NextFunction) {
  try {
    const query = readQuery(req);
    const result = await listPublicLocalized("vehicles", {
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

// GET /api/vehicles/:slug - one published vehicle, translated when ?locale= is set
export async function getVehicleBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const vehicle = await getPublicBySlug("vehicles", String(req.params.slug), readLocale(req));
    ok(res, vehicle);
  } catch (error) {
    next(error);
  }
}
