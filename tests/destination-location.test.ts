/** Save → store → return path for destination map coordinates (no database needed). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { destinationUpdate } from "../src/validations/content.js";
import { Destination } from "../src/models/Destination.js";
import { PUBLIC_RESOURCES } from "../src/services/public.service.js";
import { TRANSLATABLE } from "../src/services/translation/registry.js";
import { completeLocation } from "../src/scripts/seed-destinations.js";

test("admin payload with numeric lat/lng is validated and stored as numbers", async () => {
  // Exactly what the admin form sends after fromFormValues() (number inputs converted to numbers).
  const parsed = destinationUpdate.parse({ name: "Kandy", location: { lat: 7.2955, lng: 80.6356 } });
  assert.deepEqual(parsed.location, { lat: 7.2955, lng: 80.6356 });
  const doc = new Destination({ name: "Kandy", slug: "kandy" });
  doc.set(parsed); // same as CrudService.update
  await doc.validate();
  const stored = doc.toObject() as { location: { lat: unknown; lng: unknown } };
  assert.equal(typeof stored.location.lat, "number");
  assert.deepEqual({ lat: stored.location.lat, lng: stored.location.lng }, { lat: 7.2955, lng: 80.6356 });
  // JSON (the public API envelope) keeps both values.
  assert.deepEqual(JSON.parse(JSON.stringify(stored)).location, { lat: 7.2955, lng: 80.6356 });
});

test("clearing the location stores null for both values", () => {
  assert.deepEqual(destinationUpdate.parse({ location: { lat: null, lng: null } }).location, { lat: null, lng: null });
  assert.deepEqual(destinationUpdate.parse({ location: { lat: "", lng: "" } }).location, { lat: null, lng: null });
});

test("rejects coordinates that could never be drawn: swapped, outside Sri Lanka, half-filled or strings", () => {
  for (const location of [
    { lat: 80.6337, lng: 7.2906 }, // swapped
    { lat: 51.5, lng: -0.1 },
    { lat: 0, lng: 0 },
    { lat: 7.29, lng: null }, // half-filled (the gangaramaya-temple case)
    { lat: null, lng: 80.63 },
    { lat: "7.29", lng: "80.63" }, // strings are not accepted by the API
  ]) {
    assert.equal(destinationUpdate.safeParse({ location }).success, false, JSON.stringify(location));
  }
});

test("public API returns location on list and detail, and translations never touch it", () => {
  assert.match(PUBLIC_RESOURCES.destinations.listSelect, /\blocation\b/);
  assert.ok(!TRANSLATABLE.destination.fields.some((f) => f.startsWith("location")));
});

test("seed fills only missing coordinates, field by field", () => {
  const fallback = { lat: 6.9166, lng: 79.8564 };
  assert.equal(completeLocation({ lat: 7, lng: 80 }, fallback), undefined); // existing values are never overwritten
  assert.deepEqual(completeLocation(undefined, fallback), fallback);
  assert.deepEqual(completeLocation({ lat: 6.91665, lng: null }, fallback), { lat: 6.91665, lng: 79.8564 });
});
