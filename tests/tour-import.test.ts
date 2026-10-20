import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTourImport, mapTour } from "../src/scripts/import-tours.js";
import { Tour } from "../src/models/Tour.js";

test("reference import deduplicates tours and keeps all records as valid drafts", async () => {
  const data = loadTourImport();
  assert.equal(data.categories.length, 10);
  assert.equal(data.tours.length, 26);
  assert.equal(data.duplicates.length, 1);
  for (const source of data.tours) {
    const record = mapTour(source);
    assert.equal(record.status, "draft");
    assert.equal(record.durationDays, source.duration.days);
    await new Tour(record).validate();
  }
});
test("multi-day itinerary ranges preserve their duration and activities", () => {
  const source = loadTourImport().tours[0];
  const record = mapTour(source);
  assert.equal(record.itinerary?.[1].day, 2);
  assert.equal(record.itinerary?.[1].title, "Tangalle (days 2-3)");
  assert.deepEqual(record.itinerary?.[1].activities, source.itineraryReference[1].activities_summary);
});
test("missing itineraries remain empty and invalid ranges are rejected", () => {
  const source = { ...loadTourImport().tours[0], itineraryReference: [] };
  assert.deepEqual(mapTour(source).itinerary, []);
  assert.throws(() => mapTour({ ...source, itineraryReference: [{ day_start: 2, day_end: 1, location: "Galle", activities_summary: [] }] }));
});

import { detailPatch } from "../src/scripts/enrich-imported-tours.js";

test("imported tours retain confirmed details and explicitly missing itineraries", async () => {
  for (const source of loadTourImport().tours) {
    const record = mapTour(source);
    assert.ok(record.shortDescription && record.shortDescription.length > 40, record.slug);
    assert.ok(record.description && record.description.length > 80, record.slug);
    if (source.itineraryStatus === "awaiting-confirmation") {
      assert.deepEqual(record.highlights, []);
      assert.deepEqual(record.itinerary, []);
    } else {
      assert.ok(record.highlights && record.highlights.length >= 1, record.slug);
      assert.ok(record.itinerary && record.itinerary.length >= 2, record.slug);
    }
    await new Tour(record).validate();
  }
});
test("enrichment preserves editor content, pricing, media and publication status", () => {
  const source = mapTour(loadTourImport().tours[0]);
  const existing = { shortDescription: "Editor summary", description: "Editor text", highlights: ["Mine"], itinerary: [{ day: 1, title: "Custom" }], startLocation: "Mine", endLocation: "Mine", price: 200, status: "published" };
  assert.deepEqual(detailPatch(existing, source), {});
  const patch = detailPatch({ description: "", shortDescription: "", itinerary: [], highlights: [] }, source);
  assert.equal(patch.description, source.description);
  assert.ok(!("status" in patch) && !("price" in patch) && !("heroMedia" in patch));
});

test("archive editorial notes are removed without changing itinerary activities", () => {
  const note = "source day text appears duplicated from Galle and needs review";
  const source = mapTour(loadTourImport().tours[0]);
  const patch = detailPatch({ itinerary: [{ activities: ["City stop", note], description: `City stop; ${note}` }] }, source);
  assert.deepEqual(patch["itinerary.0.activities"], ["City stop"]);
  assert.equal(patch["itinerary.0.description"], "City stop");
});

test("Honeymoon activities follow the verified comparison columns", () => {
  const tours = loadTourImport().tours;
  const coastal = tours.find(t => t.slug === "coastal-romance")!;
  const romantic = tours.find(t => t.slug === "romantic-retreat-in-the-hills")!;
  const adventure = tours.find(t => t.slug === "adventure-culture-love")!;
  assert.ok(coastal.highlights?.includes("Sunset Cruise"));
  assert.ok(!coastal.highlights?.includes("Yala National Park"));
  assert.ok(romantic.highlights?.includes("Tea Factory"));
  assert.ok(!romantic.highlights?.includes("Royal Botanical Garden"));
  assert.ok(adventure.highlights?.includes("Royal Botanical Garden"));
  assert.ok(adventure.highlights?.includes("Sunset Cruise - Bentota"));
  assert.ok(!adventure.highlights?.includes("Tea Factory"));
});
test("Family itinerary uses the confirmed package route in the Family category", () => {
  const tour = loadTourImport().tours.find(t => t.slug === "family-escapade-in-sri-lanka")!;
  assert.equal(tour.categorySlug, "family-tours");
  assert.equal(tour.itineraryStatus, undefined);
  const record = mapTour(tour);
  assert.equal(record.itinerary?.length, 19);
  assert.deepEqual(record.itinerary?.map(step => step.day), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.equal(record.itinerary?.[0].location, "Negombo");
  assert.equal(record.itinerary?.[18].location, "Departure");
});
