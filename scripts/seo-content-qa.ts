/** Exercises the actual migration against a temporary database, never the configured site database. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { startAdminQa } from "./admin-functional-server.js";
import { SEO_AUDIT_CONTENT } from "../src/scripts/seo-audit-content.js";

async function run(apply: boolean) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/scripts/improve-page-seo.ts", ...(apply ? ["--apply"] : [])], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env: process.env });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Migration exited with ${code}`)));
  });
}

async function main() {
  const qa = await startAdminQa();
  try {
    const { Page } = qa.models;
    const legacy = await Page.create({ slug: "gallery", title: "Gallery", seo: { metaDescription: "Photos and videos from around Sri Lanka.", canonicalUrl: "https://example.test/gallery" } });
    await Page.create({ slug: "contact", title: "Contact", content: "Custom body", seo: { seoTitle: "Custom title", metaDescription: "Custom description" } });
    await run(false);
    assert.equal((await Page.findById(legacy._id).lean())?.content, "", "dry-run never changes content");
    await run(true);
    const saved = await Page.findById(legacy._id).lean();
    assert.equal(saved?.content, SEO_AUDIT_CONTENT.gallery.content);
    assert.equal(saved?.seo.metaDescription, SEO_AUDIT_CONTENT.gallery.metaDescription);
    assert.equal(saved?.seo.canonicalUrl, "https://example.test/gallery");
    const custom = await Page.findOne({ slug: "contact" }).lean();
    assert.equal(custom?.content, "Custom body");
    assert.equal(custom?.seo.seoTitle, "Custom title");
    const firstTimestamp = saved?.updatedAt.getTime();
    await run(true);
    assert.equal((await Page.findById(legacy._id).lean())?.updatedAt.getTime(), firstTimestamp, "second apply makes no changes");
    console.log("PASS: dry-run, actual apply, custom-copy preservation and idempotence in a temporary database");
  } finally { await qa.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
