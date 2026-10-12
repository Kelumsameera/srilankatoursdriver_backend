import assert from "node:assert/strict";
import { test } from "node:test";
import { heroCreate, heroUpdate } from "../src/validations/content.js";

test("hero media switching preserves optional posters and partial update semantics", () => {
  assert.deepEqual(heroUpdate.parse({ video: null }), { video: null });
  assert.equal(heroCreate.safeParse({ title: "Hero", video: { resourceType: "video", url: "https://res.cloudinary.com/demo/video/upload/hero.mov" } }).success, true);
  assert.equal(heroCreate.safeParse({ title: "Hero", desktopImage: { resourceType: "image", url: "https://example.com/poster.jpg" } }).success, true);
});

test("hero validation rejects wrong resource types and unsafe URLs", () => {
  for (const input of [{ title: "Hero", video: { resourceType: "image" } }, { title: "Hero", desktopImage: { resourceType: "video" } }, { title: "Hero", mobileImage: { resourceType: "video" } }, { title: "Hero", video: { resourceType: "video", url: "javascript:alert(1)" } }]) {
    assert.equal(heroCreate.safeParse(input).success, false);
  }
});
