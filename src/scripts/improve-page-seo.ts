/** Dry-run by default. --apply writes the reviewed changes to the configured database. */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Page } from "../models/Page.js";
import { planSeoAuditUpdate, SEO_AUDIT_CONTENT } from "./seo-audit-content.js";
import { revalidateFrontend } from "../services/revalidate.service.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply")) throw new Error("Usage: npm run seo:audit-content -- [--apply]");
  const apply = args.includes("--apply");
  await connectDatabase();
  try {
    const pages = await Page.find({ slug: { $in: Object.keys(SEO_AUDIT_CONTENT) } }).lean();
    let count = 0;
    for (const page of pages) {
      const changes = planSeoAuditUpdate(page);
      if (!Object.keys(changes).length) continue;
      console.log(JSON.stringify({ mode: apply ? "apply" : "preview", slug: page.slug, changes }, null, 2));
      if (apply) {
        // A concurrent admin edit must win over a plan based on an older document.
        const result = await Page.updateOne({ _id: page._id, updatedAt: page.updatedAt }, { $set: changes }, { runValidators: true });
        if (result.modifiedCount !== 1) throw new Error(`Page ${page.slug} changed during the update. Re-run to review the new plan.`);
      }
      count++;
    }
    if (apply && count) revalidateFrontend("pages");
    console.log(`${apply ? "Updated" : "Proposed updates for"} ${count} pages. Custom content is preserved.`);
  } finally {
    await disconnectDatabase();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "SEO update failed"); process.exitCode = 1; });
