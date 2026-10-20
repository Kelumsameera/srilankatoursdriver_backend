/** Site Appearance (BrandSetting.theme): validation, CSS sanitising and storage (no database needed). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { brandingUpdate } from "../src/validations/settings.js";
import { sanitizeCustomCss } from "../src/validations/theme.js";
import { BrandSetting } from "../src/models/BrandSetting.js";

test("a full theme from the admin page is accepted and stored as one object", async () => {
  const theme = {
    preset: "ocean",
    mode: "light",
    colors: { primary: "#0b3954", background: "#f5fbff" },
    darkColors: { background: "#0b1220" },
    customThemes: [{ name: "Monsoon", colors: { primary: "#123456" }, darkColors: {} }],
    typography: { headingFont: "Noto Serif", bodyFont: "Inter", sinhalaFont: "Noto Sans Sinhala", baseSize: 16, lineHeight: 1.6, headingSizes: { h1: 56, h4: 22 } },
    background: { type: "gradient", gradient: { direction: 135, stops: ["#ffffff", "#e3efe8"] } },
    radiusScale: 1.25,
    buttonStyle: "rounded",
    spacingScale: 1,
    customCss: ".hero { letter-spacing: 0.01em; }",
  };
  const parsed = brandingUpdate.parse({ theme });
  assert.deepEqual(parsed.theme, theme);
  const doc = new BrandSetting({ key: "default" });
  doc.set("theme", parsed.theme);
  await doc.validate();
  assert.equal((doc.toObject().theme as { colors: { primary: string } }).colors.primary, "#0b3954");
});

test("documents saved before the theme field existed have no theme (frontend defaults apply)", () => {
  assert.equal(new BrandSetting({ key: "default" }).toObject().theme, undefined);
});

test("refuses values that could inject CSS or markup", () => {
  for (const theme of [
    { colors: { primary: "red;}body{display:none" } },
    { typography: { headingFont: "Inter'); @import url(x" } },
    { background: { image: { url: "javascript:alert(1)" } } },
    { background: { image: { url: 'https://x.test/a.png") , url("http://evil' } } },
    { background: { gradient: { stops: ["#ffffff"] } } },
    { radiusScale: 10 },
    { buttonStyle: "blob" },
    { customCss: "a".repeat(20_001) },
  ]) {
    assert.equal(brandingUpdate.safeParse({ theme }).success, false, JSON.stringify(theme).slice(0, 80));
  }
});

test("custom CSS is sanitised on save", () => {
  const css = sanitizeCustomCss(
    `@import url("https://evil.test/x.css"); </style><script>alert(1)</script> .a{background:url(http://evil.test/p.png)} .b{background:url("https://res.cloudinary.com/x.png")} .c{width:expression(alert(1))} .d{behavior:url(x.htc)} .e{background:url(javascript:alert(1))}`,
  );
  assert.ok(!css.includes("<"));
  assert.ok(!/@import/i.test(css));
  assert.ok(!/expression\(/i.test(css));
  assert.ok(!/javascript:/i.test(css));
  assert.ok(!/behavior:/i.test(css));
  assert.ok(!css.includes("http://evil"));
  assert.ok(css.includes('url("https://res.cloudinary.com/x.png")'));
  assert.equal(brandingUpdate.parse({ theme: { customCss: "</style>.x{color:red}" } }).theme?.customCss, "/style>.x{color:red}");
});
