import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category, Page, PageSection } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

// Switch the homepage "Honeymoon tours" section to the staggered tall-card layout.
// Dry run by default; add --apply to write (a backup of the section is saved first).
try {
  await connectDatabase();
  const page = await Page.findOne({ slug: "home" }).lean();
  if (!page) throw new Error("Homepage missing");
  const category = await Category.findOne({ kind: "tour", slug: "honeymoon-tours" }).lean();
  if (!category) throw new Error("Category honeymoon-tours missing");
  const section = await PageSection.findOne({ page: page._id, type: "popularTours", "settings.category": category._id }).lean();
  if (!section) throw new Error("Honeymoon section missing on the homepage");

  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), section: section.title, from: section.settings?.layout, to: "staggered" }));
  if (process.argv.includes("--apply")) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/honeymoon-section-${Date.now()}.json`, JSON.stringify(section, null, 2));
    await PageSection.updateOne({ _id: section._id }, { $set: { "settings.layout": "staggered" } }, { runValidators: true });
    revalidateFrontend(CACHE_TAGS.pages);
    // Give the cache refresh request time to finish before the process exits
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
