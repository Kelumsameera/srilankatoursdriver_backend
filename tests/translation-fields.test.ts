import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSLATABLE, extractFields } from "../src/services/translation/registry.js";
import { readTranslationResult } from "../src/scripts/lib/translation-work.js";

test("translation output is matched by ID even when response properties are reordered", () => {
  assert.deepEqual(readTranslationResult(["Offers", "Our team"], { "1": "Unser Team", "0": "Angebote" }), ["Angebote", "Unser Team"]);
  assert.throws(() => readTranslationResult(["Offers", "Our team"], ["Unser Team", "Angebote"]));
  assert.throws(() => readTranslationResult(["Offers", "Our team"], { "0": "Angebote", "2": "Unser Team" }));
  assert.throws(() => readTranslationResult(["Visit https://example.com/{name}"], { "0": "Besuchen Sie https://other.example/" }));
});

test("public descriptive fields include nested language names and image text without translating URLs", () => {
  const settings = {
    team: { members: [{ name: "Amal", role: "Driver", languages: ["English", "German"], photo: { alt: "Our driver", url: "https://example.com/photo.jpg" } }] },
  };
  assert.deepEqual(extractFields(settings, TRANSLATABLE.siteSetting.fields), {
    "team.members.0.role": "Driver",
    "team.members.0.languages.0": "English",
    "team.members.0.languages.1": "German",
    "team.members.0.photo.alt": "Our driver",
  });
  const tour = { startLocation: "Colombo", endLocation: "Airport", heroMedia: { alt: "Tour guide", url: "https://example.com/guide.jpg" }, gallery: [{ alt: "Tea estate" }], driver: { languages: ["English"] } };
  assert.deepEqual(extractFields(tour, TRANSLATABLE.tour.fields), {
    startLocation: "Colombo", endLocation: "Airport", "driver.languages.0": "English", "heroMedia.alt": "Tour guide", "gallery.0.alt": "Tea estate",
  });
});

test("new nested content is missing until translations are generated for it", async () => {
  const { computeState } = await import("../src/services/translation/translation.service.js");
  const { sha256 } = await import("../src/utils/helpers.js");
  const source = extractFields({ title: "Our team", items: [{ image: { alt: "Tour guide" } }] }, TRANSLATABLE.pageSection.fields);
  const row = { fields: { title: "Unser Team" }, sourceHashes: { title: sha256("Our team") } };
  assert.equal(computeState(source, row), "outdated");
  assert.equal(computeState(source, { fields: { ...row.fields, "items~0~image~alt": "Reiseleiter" }, sourceHashes: { ...row.sourceHashes, "items~0~image~alt": sha256("Tour guide") } }), "up_to_date");
});
