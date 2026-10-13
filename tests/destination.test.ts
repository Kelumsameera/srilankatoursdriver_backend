import assert from "node:assert/strict";
import { test } from "node:test";
import { destinationCreate, destinationUpdate } from "../src/validations/content.js";
import { Destination } from "../src/models/Destination.js";

test("legacy destination payloads remain valid and partial updates add no defaults", async () => {
  assert.equal(destinationCreate.safeParse({ name: "Anuradhapura", slug: "anuradhapura" }).success, true);
  assert.deepEqual(destinationUpdate.parse({ region: "North Central" }), { region: "North Central" });
  const doc = new Destination({ name: "Anuradhapura", slug: "anuradhapura" });
  await doc.validate();
  assert.deepEqual(doc.featuredExperiences.toObject(), []);
});

test("experience content accepts safe links, media metadata and stable subdocument ids", () => {
  const input = { featuredExperiences: [{ _id: "507f1f77bcf86cd799439011", title: "Sacred city walk", description: "Explore with a local guide.", image: { url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", resourceType: "image", alt: "A walking trail" }, detailUrl: "/excursions/city-walk" }] };
  assert.deepEqual(destinationUpdate.parse(input), input);
  assert.equal(destinationUpdate.safeParse({ featuredExperiences: [{ title: "Walk", detailUrl: "https://example.com/walk" }] }).success, true);
});

test("rejects unsafe links, video cards, empty titles, oversized lists and invalid coordinates", () => {
  for (const detailUrl of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,test"]) {
    assert.equal(destinationUpdate.safeParse({ featuredExperiences: [{ title: "Walk", detailUrl }] }).success, false);
  }
  for (const payload of [{ featuredExperiences: [{ title: " " }] }, { featuredExperiences: [{ title: "Walk", image: { resourceType: "video" } }] }, { featuredExperiences: Array.from({ length: 31 }, () => ({ title: "Walk" })) }, { location: { lat: 91 } }, { location: { lng: 181 } }, { location: { lat: 80.6, lng: 7.3 } }, { location: { lat: 51.5, lng: -0.1 } }]) {
    assert.equal(destinationUpdate.safeParse(payload).success, false);
  }
  assert.deepEqual(destinationUpdate.parse({ location: { lat: null, lng: null } }), { location: { lat: null, lng: null } });
});
