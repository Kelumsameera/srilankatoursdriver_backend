import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { BrandSetting, Translation } from "../src/models/index.js";
import { getBranding } from "../src/services/settings.service.js";
import { localize } from "../src/services/translation/translation.service.js";
import { sha256 } from "../src/utils/helpers.js";

test("public branding GET returns defaults without database creation", async () => {
  const find = mock.method(BrandSetting, "findOne", () => ({ lean: async () => null }));
  const create = mock.method(BrandSetting, "create", () => { throw new Error("GET must not write"); });
  try {
    const result = await getBranding();
    assert.equal(result.key, "default");
    assert.equal(create.mock.callCount(), 0);
  } finally { find.mock.restore(); create.mock.restore(); }
});

test("published translation overlay respects current hashes, absent fields and English fallback", async () => {
  const source = { _id: "507f1f77bcf86cd799439011", name: "Colombo", subtitle: "City by the sea", featuredExperiences: [{ title: "Walking tour", description: "A city walk" }] };
  const find = mock.method(Translation, "find", (filter: { published: boolean }) => {
    assert.equal(filter.published, true);
    return { lean: async () => [{ entityId: source._id, fields: { name: "Colombo translated", subtitle: "Outdated subtitle", "featuredExperiences~0~title": "Translated walk", description: "Unknown field" }, sourceHashes: { name: sha256(source.name), subtitle: sha256("Previous subtitle"), "featuredExperiences~0~title": sha256("Walking tour") } }] };
  });
  try {
    const [translated] = await localize("destination", [source], "fr");
    assert.equal(translated.name, "Colombo translated");
    assert.equal(translated.subtitle, source.subtitle);
    assert.equal(translated.featuredExperiences[0].title, "Translated walk");
    assert.equal(translated.featuredExperiences[0].description, "A city walk");
    assert.equal(source.featuredExperiences[0].title, "Walking tour");
    assert.deepEqual(await localize("destination", [source], "en"), [source]);
  } finally { find.mock.restore(); }
});
