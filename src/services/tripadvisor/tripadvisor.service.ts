import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { mapTripAdvisor, type TripAdvisorDetailsResponse, type TripAdvisorReviewsResponse, type TripAdvisorSummary } from "./tripadvisor.mapper.js";

export type { TripAdvisorReview, TripAdvisorSummary } from "./tripadvisor.mapper.js";

/**
 * TripAdvisor Content API adapter. Returns real data only – when the API is not
 * configured it returns `configured: false` and the frontend shows a link to the profile.
 * Docs: https://tripadvisor-content-api.readme.io/
 * The free tier is 5,000 calls/month and /reviews returns at most 5 reviews, so the result is
 * cached for 6 h (≈ 240 calls/month). After a failure (bad key, 429 quota, API down) we wait
 * 15 min before trying again and keep serving the last good data, or nothing (CMS reviews only).
 */
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
let cache: { at: number; data: TripAdvisorSummary } | null = null;
let failedAt = 0;

export function isTripAdvisorConfigured(): boolean {
  return Boolean(env.TRIPADVISOR_API_KEY && env.TRIPADVISOR_LOCATION_ID);
}

async function get<T>(path: string): Promise<T> {
  const url = `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(env.TRIPADVISOR_LOCATION_ID!)}${path}${
    path.includes("?") ? "&" : "?"
  }key=${encodeURIComponent(env.TRIPADVISOR_API_KEY!)}&language=en`;
  // Keys can be locked to a domain; the API then checks the Referer, so send the site's URL.
  const res = await fetch(url, {
    headers: { accept: "application/json", referer: env.FRONTEND_URL },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`TripAdvisor API ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export async function getTripAdvisorSummary(): Promise<TripAdvisorSummary> {
  if (!isTripAdvisorConfigured()) return { configured: false, reviews: [] };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const fallback = cache?.data ?? { configured: true, reviews: [] };
  if (Date.now() - failedAt < RETRY_MS) return fallback;
  try {
    const [details, reviews] = await Promise.all([get<TripAdvisorDetailsResponse>("/details"), get<TripAdvisorReviewsResponse>("/reviews")]);
    const data = mapTripAdvisor(details, reviews);
    cache = { at: Date.now(), data };
    failedAt = 0;
    return data;
  } catch (err) {
    failedAt = Date.now();
    logger.warn({ err: err instanceof Error ? err.message : err }, "TripAdvisor fetch failed – showing CMS reviews only");
    return fallback;
  }
}
