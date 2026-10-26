/**
 * Pure TripAdvisor helpers (no env / network), so they can be unit tested.
 * Display rules: https://tripadvisor-content-api.readme.io/reference/display-requirements
 * – only 5-bubble reviews may be quoted, and only while the overall rating is 4+.
 */
export interface TripAdvisorReview {
  id: string;
  title: string;
  text: string;
  rating: number;
  /** Bubble image from the API (TripAdvisor requires its own bubbles, not our stars). */
  ratingImageUrl?: string;
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
  writeReviewUrl?: string;
  reviews: TripAdvisorReview[];
}

export interface TripAdvisorDetailsResponse {
  name?: string;
  rating?: string;
  num_reviews?: string;
  rating_image_url?: string;
  web_url?: string;
  write_review?: string;
}

export interface TripAdvisorReviewsResponse {
  data?: {
    id: number | string;
    title?: string;
    text?: string;
    rating?: number | string;
    rating_image_url?: string;
    published_date?: string;
    url?: string;
    user?: { username?: string; user_location?: { name?: string } };
  }[];
}

const num = (v: unknown) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Maps the /details + /reviews responses to our summary, keeping only reviews TripAdvisor lets us quote. */
export function mapTripAdvisor(details: TripAdvisorDetailsResponse, reviews: TripAdvisorReviewsResponse): TripAdvisorSummary {
  const rating = num(details.rating);
  const quotable = (rating ?? 0) >= 4;
  return {
    configured: true,
    name: details.name,
    rating,
    numReviews: num(details.num_reviews),
    ratingImageUrl: details.rating_image_url,
    webUrl: details.web_url,
    writeReviewUrl: details.write_review,
    reviews: quotable
      ? (reviews.data ?? [])
          .filter((r) => num(r.rating) === 5 && r.text?.trim() && r.url)
          .map((r) => ({
            id: String(r.id),
            title: r.title?.trim() ?? "",
            text: r.text!.trim(),
            rating: 5,
            ratingImageUrl: r.rating_image_url,
            publishedDate: r.published_date ?? "",
            url: r.url!,
            user: { username: r.user?.username?.trim() || "TripAdvisor traveller", country: r.user?.user_location?.name },
          }))
      : [],
  };
}

type AnyRecord = Record<string, unknown>;

/**
 * Puts live TripAdvisor reviews in front of the CMS reviews (newest first). Reviews already copied
 * into the CMS (same guest name) are skipped. No live reviews → the CMS list is returned unchanged.
 */
export function mergeLiveReviews(items: unknown[], ta: TripAdvisorSummary, limit: number): unknown[] {
  const known = new Set((items as AnyRecord[]).map((r) => String(r.guestName ?? "").trim().toLowerCase()));
  const live = ta.reviews
    .filter((r) => !known.has(r.user.username.trim().toLowerCase()))
    .map((r) => ({
      _id: `tripadvisor-${r.id}`,
      guestName: r.user.username,
      country: r.user.country ?? "",
      rating: r.rating,
      ratingImageUrl: r.ratingImageUrl,
      title: r.title,
      review: r.text,
      date: r.publishedDate,
      platform: "tripadvisor",
      sourceUrl: r.url,
      verified: true,
      live: true,
    }));
  if (!live.length) return items;
  const byDate = (r: AnyRecord) => new Date(String(r.date ?? 0)).getTime() || 0;
  return [...live, ...(items as AnyRecord[])].sort((a, b) => byDate(b) - byDate(a)).slice(0, Math.max(limit, live.length));
}
