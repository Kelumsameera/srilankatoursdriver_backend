import { test } from "node:test";
import assert from "node:assert/strict";
import { fillBlanks, loadContent } from "../src/scripts/seed-destinations.js";
import { scoreText } from "../scripts/image-match-utils.js";

const content = loadContent();
const kandy = content.destinations.find((d) => d.slug === "kandy")!;

test("content file has 29 unique destinations with attractions and coordinates", () => {
  assert.equal(content.destinations.length, 29);
  assert.equal(new Set(content.destinations.map((d) => d.slug)).size, 29);
  for (const d of content.destinations) {
    assert.ok(d.attractions.length >= 3, d.slug);
    assert.ok(d.location.lat > 5.8 && d.location.lat < 9.9 && d.location.lng > 79.5 && d.location.lng < 82, d.slug);
    assert.ok(content.categories.some((c) => c.slug === d.category), d.slug);
  }
});

test("seed only fills blank fields and publishes", () => {
  const set = fillBlanks({ name: "Kandy", shortDescription: "Edited in admin", status: "archived", location: { lat: 7.3, lng: 80.6 }, order: 4, featuredExperiences: [{ title: "Mine" }] }, kandy, "cat");
  assert.equal(set.shortDescription, undefined);
  assert.equal(set.featuredExperiences, undefined);
  assert.equal(set.location, undefined);
  assert.equal(set.order, undefined);
  assert.equal(set.status, "published");
  assert.equal(set.tagline, kandy.tagline);
});

test("seed is idempotent: a fully seeded document needs no changes", () => {
  const first = fillBlanks(null, kandy, "cat");
  const doc = { ...first, seo: { seoTitle: first["seo.seoTitle"], metaDescription: first["seo.metaDescription"] } };
  assert.deepEqual(fillBlanks(doc, kandy, "cat"), {});
});

test("image matching normalises spellings and penalises other places", () => {
  assert.equal(scoreText("nuwaraeliya", "Nuwara Eliya"), 1);
  assert.equal(scoreText("Nuwara-Eliya_01.jpg", "Nuwara Eliya"), 1);
  assert.equal(scoreText("pasikuda", "Passikudah"), 1);
  assert.ok(scoreText("galle-face-green", "Galle") < 0.5); // a Colombo landmark, not Galle
  assert.equal(scoreText("kandy", "Yala"), 0);
});
