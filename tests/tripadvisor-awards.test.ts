import assert from "node:assert/strict";
import { test } from "node:test";
import { siteSettingsUpdate } from "../src/validations/settings.js";
import { SiteSetting } from "../src/models/SiteSetting.js";

const award = { year: 2026, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html" };
test("yearly awards survive validation and the settings model", async () => {
  const patch = siteSettingsUpdate.parse({ tripadvisor: { awards: [2024, 2025, 2026].map((year) => ({ ...award, year })) } });
  const settings = new SiteSetting({ siteName: "Test", businessName: "Test", tripadvisor: { enabled: false, ...patch.tripadvisor } });
  await settings.validate();
  assert.deepEqual(settings.toObject().tripadvisor.awards.map((item) => item.year), [2024, 2025, 2026]);
  assert.equal(settings.tripadvisor.enabled, false);
});
test("invalid award years and unsafe or misleading links are rejected without throwing", () => {
  for (const year of [1999, 2101, 2026.5]) assert.equal(siteSettingsUpdate.safeParse({ tripadvisor: { awards: [{ ...award, year }] } }).success, false);
  for (const sourceUrl of ["invalid", "javascript:alert(1)", "http://www.tripadvisor.com/", "https://tripadvisor.com.evil.example/", "https://evil.example/tripadvisor.com"]) {
    assert.equal(siteSettingsUpdate.safeParse({ tripadvisor: { awards: [{ ...award, sourceUrl }] } }).success, false);
  }
});
test("empty award list and old settings remain supported", () => {
  assert.equal(siteSettingsUpdate.safeParse({ tripadvisor: { awards: [] } }).success, true);
  const settings = new SiteSetting({ siteName: "Test", businessName: "Test", tripadvisor: { enabled: false } });
  assert.deepEqual(settings.toObject().tripadvisor.awards, []);
});
