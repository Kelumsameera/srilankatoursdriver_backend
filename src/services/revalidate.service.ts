import { env, isTest } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Cache tags used by the Next.js frontend. After any admin change the backend notifies
 * the frontend so public pages update immediately (instead of waiting for ISR expiry).
 */
export const CACHE_TAGS = {
  settings: "settings",
  branding: "branding",
  navigation: "navigation",
  pages: "pages",
  hero: "hero",
  tours: "tours",
  destinations: "destinations",
  excursions: "excursions",
  vehicles: "vehicles",
  categories: "categories",
  gallery: "gallery",
  blog: "blog",
  guestShorts: "guest-shorts",
  reviews: "reviews",
  faqs: "faqs",
  seo: "seo",
  translations: "translations",
  languages: "languages",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

let pending = new Set<string>();
let timer: NodeJS.Timeout | null = null;

/** Debounced, fire-and-forget revalidation request to the frontend. */
export function revalidateFrontend(...tags: string[]): void {
  if (isTest || !env.REVALIDATE_SECRET) return;
  tags.forEach((t) => pending.add(t));
  if (timer) return;
  timer = setTimeout(() => {
    const batch = Array.from(pending);
    pending = new Set();
    timer = null;
    void fetch(`${env.FRONTEND_URL.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": env.REVALIDATE_SECRET! },
      body: JSON.stringify({ tags: batch }),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => {
        if (!r.ok) logger.warn({ status: r.status }, "Frontend revalidation rejected");
      })
      .catch((err: unknown) => logger.debug({ err }, "Frontend revalidation failed (is the frontend running?)"));
  }, 300);
}
