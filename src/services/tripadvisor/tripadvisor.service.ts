import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * TripAdvisor Content API adapter. Returns real data only – when the API is not
 * configured it returns `configured: false` and the frontend shows a link to the profile.
 * Docs: https://tripadvisor-content-api.readme.io/
 */
export interface TripAdvisorReview {
  id: string;
  title: string;
  text: string;
  rating: number;
  publishedDate: string;
  url: string;
  user: { username: string; country?: string };
}

export interface TripAdvisorSummary {
  configured: boolean;
  name?: string;
  rating?: number;
  numReviews?: number;
  ratingImageUrl?: string;
  webUrl?: string;
  reviews: TripAdvisorReview[];
}

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; data: TripAdvisorSummary } | null = null;

export function isTripAdvisorConfigured(): boolean {
  return Boolean(env.TRIPADVISOR_API_KEY && env.TRIPADVISOR_LOCATION_ID);
}

async function get<T>(path: string): Promise<T> {
  const url = `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(env.TRIPADVISOR_LOCATION_ID!)}${path}${
    path.includes("?") ? "&" : "?"
  }key=${encodeURIComponent(env.TRIPADVISOR_API_KEY!)}&language=en`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TripAdvisor API ${res.status}`);
  return (await res.json()) as T;
}

export async function getTripAdvisorSummary(): Promise<TripAdvisorSummary> {
  if (!isTripAdvisorConfigured()) return { configured: false, reviews: [] };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const [details, reviews] = await Promise.all([
      get<{ name?: string; rating?: string; num_reviews?: string; rating_image_url?: string; web_url?: string }>("/details"),
      get<{
        data?: {
          id: number;
          title: string;
          text: string;
          rating: number;
          published_date: string;
          url: string;
          user?: { username?: string; user_location?: { name?: string } };
        }[];
      }>("/reviews"),
    ]);
    const data: TripAdvisorSummary = {
      configured: true,
      name: details.name,
      rating: details.rating ? Number(details.rating) : undefined,
      numReviews: details.num_reviews ? Number(details.num_reviews) : undefined,
      ratingImageUrl: details.rating_image_url,
      webUrl: details.web_url,
      reviews: (reviews.data ?? []).map((r) => ({
        id: String(r.id),
        title: r.title,
        text: r.text,
        rating: r.rating,
        publishedDate: r.published_date,
        url: r.url,
        user: { username: r.user?.username ?? "TripAdvisor traveller", country: r.user?.user_location?.name },
      })),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    logger.warn({ err }, "TripAdvisor fetch failed");
    return cache?.data ?? { configured: true, reviews: [] };
  }
}
