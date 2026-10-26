/** Branding: the icon + text logo fields (validation and storage, no database needed). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGO_TEXT_MAX, brandingUpdate } from "../src/validations/settings.js";
import { BrandSetting } from "../src/models/BrandSetting.js";

test("logo icon and two text lines are accepted, trimmed and stored", async () => {
  const parsed = brandingUpdate.parse({
    logoIcon: { url: "https://res.cloudinary.com/demo/image/upload/branding/pin.png", alt: "Map pin" },
    logoTextLine1: "  SRI LANKA ",
    logoTextLine2: "TOURS DRIVER",
  });
  assert.equal(parsed.logoTextLine1, "SRI LANKA");
  const doc = new BrandSetting({ key: "default" });
  doc.set(parsed);
  await doc.validate();
  const saved = doc.toObject();
  assert.equal(saved.logoIcon?.url, "https://res.cloudinary.com/demo/image/upload/branding/pin.png");
  assert.equal(saved.logoTextLine2, "TOURS DRIVER");
});

test("the icon can be removed and long or unsafe values are refused", () => {
  assert.equal(brandingUpdate.parse({ logoIcon: null }).logoIcon, null);
  assert.equal(brandingUpdate.safeParse({ logoTextLine1: "x".repeat(LOGO_TEXT_MAX + 1) }).success, false);
  assert.equal(brandingUpdate.safeParse({ logoIcon: { url: "javascript:alert(1)" } }).success, false);
});

test("documents saved before these fields existed keep using the logo images", () => {
  const doc = new BrandSetting({ key: "default" }).toObject();
  assert.equal(doc.logoIcon, undefined);
  assert.equal(doc.logoTextLine1, "");
  assert.equal(doc.logoTextLine2, "");
});
