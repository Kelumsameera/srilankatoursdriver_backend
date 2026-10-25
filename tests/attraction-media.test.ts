import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAttractionMedia } from "../src/scripts/seed-attraction-media.js";

const image = { url: "/images/editorial/attractions/pidurangala.webp" };

test("attraction content fills missing images and adds places without losing CMS edits", () => {
  const existing = [
    { _id: "one", title: "Pidurangala Rock", description: "Admin copy", image: null, verified: false },
    { _id: "two", title: "Museum", image: { url: "https://example.com/admin.webp" } },
  ];
  const result = mergeAttractionMedia(existing, [
    { title: "Pidurangala Rock", image, description: "Seed copy", verified: true },
    { title: "Museum", image },
    { title: "Water Gardens", description: "New place", image },
  ]);
  assert.deepEqual(result[0], { ...existing[0], image });
  assert.deepEqual(result[1], existing[1]);
  assert.equal(result[2].title, "Water Gardens");
  assert.equal(existing[0].image, null);
  assert.deepEqual(mergeAttractionMedia(result, [{ title: "Water Gardens", image }]), result);
});

test("normalizes punctuation and whitespace when matching an attraction", () => {
  const result = mergeAttractionMedia([{ title: " Adam’s Peak " }], [{ title: "Adam's Peak", image }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].image, image);
});
