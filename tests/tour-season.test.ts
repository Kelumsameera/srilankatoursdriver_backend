import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonalTourCategories } from "../src/services/public.service.js";

// Sri Lanka time is UTC+5:30, so 31 Oct 19:00 UTC is already 1 November in Colombo
const at = (iso: string) => seasonalTourCategories(new Date(iso));

test("down south tours lead from November to June", () => {
  for (const iso of ["2026-11-01T00:00:00+05:30", "2027-01-15T12:00:00Z", "2027-06-30T12:00:00Z", "2026-10-31T19:00:00Z"]) {
    assert.deepEqual(at(iso), { inSeason: "down-south-tours", offSeason: "east-coast-tours" }, iso);
  }
});

test("east coast tours lead from July to October", () => {
  for (const iso of ["2026-07-01T00:00:00+05:30", "2026-08-20T12:00:00Z", "2026-10-31T12:00:00Z"]) {
    assert.deepEqual(at(iso), { inSeason: "east-coast-tours", offSeason: "down-south-tours" }, iso);
  }
});
