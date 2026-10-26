import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTripAdvisor, mergeLiveReviews, type TripAdvisorSummary } from "../src/services/tripadvisor/tripadvisor.mapper.js";

const details = { name: "Sri Lanka Tours Driver", rating: "5.0", num_reviews: "212", rating_image_url: "https://ta/5.svg", web_url: "https://ta/profile", write_review: "https://ta/write" };
const review = (id: number, rating: number | string, extra: Record<string, unknown> = {}) => ({
  id,
  title: ` Great trip ${id} `,
  text: `Lovely driver ${id}`,
  rating,
  rating_image_url: `https://ta/${rating}.svg`,
  published_date: `2026-10-0${id}T10:00:00Z`,
  url: `https://ta/review/${id}`,
  user: { username: `guest${id}`, user_location: { name: "UK" } },
  ...extra,
});

test("maps the Content API responses and keeps only quotable 5-bubble reviews", () => {
  const ta = mapTripAdvisor(details, { data: [review(1, 5), review(2, 4), review(3, "5", { text: "  " }), review(4, 5, { user: {} })] });
  assert.equal(ta.configured, true);
  assert.equal(ta.rating, 5);
  assert.equal(ta.numReviews, 212);
  assert.equal(ta.writeReviewUrl, "https://ta/write");
  assert.deepEqual(ta.reviews.map((r) => r.id), ["1", "4"]);
  assert.deepEqual(ta.reviews[0], {
    id: "1",
    title: "Great trip 1",
    text: "Lovely driver 1",
    rating: 5,
    ratingImageUrl: "https://ta/5.svg",
    publishedDate: "2026-10-01T10:00:00Z",
    url: "https://ta/review/1",
    user: { username: "guest1", country: "UK" },
  });
  assert.equal(ta.reviews[1].user.username, "TripAdvisor traveller");
});

test("quotes no reviews while the overall rating is below 4, and survives empty responses", () => {
  assert.deepEqual(mapTripAdvisor({ ...details, rating: "3.5" }, { data: [review(1, 5)] }).reviews, []);
  const empty = mapTripAdvisor({}, {});
  assert.equal(empty.rating, undefined);
  assert.deepEqual(empty.reviews, []);
});

const cms = [
  { _id: "a", guestName: "Anna", review: "CMS one", date: "2026-09-01" },
  { _id: "b", guestName: "guest2", review: "Imported earlier", date: "2026-08-01" },
];

test("merges live reviews newest first and skips ones already in the CMS", () => {
  const ta = mapTripAdvisor(details, { data: [review(1, 5), review(2, 5)] });
  const merged = mergeLiveReviews(cms, ta, 2) as { _id: string; platform?: string; sourceUrl?: string }[];
  assert.deepEqual(merged.map((r) => r._id), ["tripadvisor-1", "a"]);
  assert.equal(merged[0].platform, "tripadvisor");
  assert.equal(merged[0].sourceUrl, "https://ta/review/1");
});

test("falls back to the CMS reviews when TripAdvisor gave nothing (no key, quota, API down)", () => {
  const failed: TripAdvisorSummary = { configured: true, reviews: [] };
  assert.equal(mergeLiveReviews(cms, failed, 6), cms);
  assert.equal(mergeLiveReviews(cms, { configured: false, reviews: [] }, 6), cms);
});

test("the service serves nothing (→ CMS reviews) on API errors and backs off instead of retrying every request", async () => {
  process.env.NODE_ENV ??= "test";
  process.env.TRIPADVISOR_API_KEY = "test-key";
  process.env.TRIPADVISOR_LOCATION_ID = "123";
  process.env.LOG_LEVEL = "silent";
  const { getTripAdvisorSummary } = await import("../src/services/tripadvisor/tripadvisor.service.js");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ message: "Too Many Requests" }), { status: 429 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await getTripAdvisorSummary(), { configured: true, reviews: [] });
    const afterFirst = calls;
    assert.deepEqual(await getTripAdvisorSummary(), { configured: true, reviews: [] });
    assert.equal(calls, afterFirst, "no new API call inside the back-off window");
  } finally {
    globalThis.fetch = realFetch;
  }
});
