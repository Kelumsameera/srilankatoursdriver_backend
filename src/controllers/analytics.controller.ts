import type { Request, Response } from "express";
import { getAnalytics, recordPageView } from "../services/analytics.service.js";
import { ok } from "../utils/response.js";
import type { AnalyticsRange } from "../validations/analytics.js";

/** Public page-view beacon. Always answers 204 so it never shows up as an error on the site. */
export async function track(req: Request, res: Response) {
  await recordPageView(req.validated?.body as Parameters<typeof recordPageView>[0], {
    ip: req.ip,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400),
    country: req.clientCountry,
  });
  res.set("Cache-Control", "no-store");
  return res.status(204).end();
}

export async function overview(req: Request, res: Response) {
  const { range } = req.validated?.query as { range: AnalyticsRange };
  return ok(res, await getAnalytics(range));
}
