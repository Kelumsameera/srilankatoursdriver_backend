import { test } from "node:test";
import assert from "node:assert/strict";
import { planSeoAuditUpdate, SEO_AUDIT_CONTENT } from "../src/scripts/seo-audit-content.js";
import { pageUpdate } from "../src/validations/content.js";

test("audit updates preserve custom text and unrelated SEO fields", () => {
  assert.deepEqual(planSeoAuditUpdate({ slug: "gallery", content: "Our own gallery introduction", seo: { seoTitle: "Our custom title", metaDescription: "Our custom description" } }), {});
});

test("only audited descriptions and missing fields are changed", () => {
  const changes = planSeoAuditUpdate({ slug: "excursions", seo: { seoTitle: "Keep this title", metaDescription: "Day trips and experiences across the island." } });
  assert.deepEqual(changes, { "seo.metaDescription": SEO_AUDIT_CONTENT.excursions.metaDescription });
  assert.deepEqual(planSeoAuditUpdate({ slug: "unknown" }), {});
});

test("proposed changes are valid page content and idempotent", () => {
  for (const [slug, copy] of Object.entries(SEO_AUDIT_CONTENT)) {
    const changes = planSeoAuditUpdate({ slug });
    const result = { slug, seo: { seoTitle: changes["seo.seoTitle"], metaDescription: changes["seo.metaDescription"] }, ...(changes.content ? { content: changes.content } : {}) };
    assert.equal(pageUpdate.safeParse(result).success, true, slug);
    assert.deepEqual(planSeoAuditUpdate(result), {}, slug);
    assert.ok(copy.metaDescription.length >= 120 && copy.metaDescription.length <= 160, slug);
    assert.ok(copy.seoTitle.length <= 60, slug);
    assert.equal(changes.status, undefined);
  }
});
