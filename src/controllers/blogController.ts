import type { NextFunction, Request, Response } from "express";
import { getPublicBySlug, listPublicLocalized } from "../services/public.service.js";
import { ok } from "../utils/response.js";
import { readLocale, readQuery } from "./publicRequest.js";

// GET /api/blog - list published blog posts (filters: featured, category, destination, search; paged)
export async function getBlogPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const query = readQuery(req);
    const result = await listPublicLocalized("blog", {
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

// GET /api/blog/:slug - one published blog post, translated when ?locale= is set
export async function getBlogPostBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const post = await getPublicBySlug("blog", String(req.params.slug), readLocale(req));
    ok(res, post);
  } catch (error) {
    next(error);
  }
}
