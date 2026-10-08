/**
 * Step 4: makes the homepage reviews slider and the About page reachable.
 *
 *   npx tsx migration/zip/scripts/reviews-about.ts            # dry run
 *   npx tsx migration/zip/scripts/reviews-about.ts --apply    # writes MongoDB
 *
 *  • Imports the 6 genuine TripAdvisor reviews of "Sri Lanka Tours Driver" that the old WordPress site showed
 *    (migration/normalized/reviews.json) as published + featured, linked to the TripAdvisor listing.
 *  • Adds an "About" link (/about) to the header menu, before "Contact", labelled in all 14 languages.
 * Re-runnable: reviews are matched by guest + date + platform, the menu item by its URL.
 */
import fs from "node:fs";
import path from "node:path";
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { SUPPORTED_LOCALES } from "../../../src/config/locales.js";
import { NavigationItem, Review } from "../../../src/models/index.js";
import { saveManualTranslation } from "../../../src/services/translation/translation.service.js";

const APPLY = process.argv.includes("--apply");
const log = (...a: unknown[]) => console.log(APPLY ? "•" : "(dry-run)", ...a);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));

async function reviews() {
  const records: Any[] = read("migration/normalized/reviews.json").records;
  for (const r of records.filter((x) => x.recommendation === "import")) {
    const d = r.data;
    const doc = {
      guestName: d.guestName,
      rating: d.rating,
      title: d.title ?? "",
      review: d.review,
      date: new Date(d.date),
      platform: d.platform ?? "tripadvisor",
      sourceUrl: d.sourceUrl ?? "",
      verified: true,
      featured: true,
      status: "published",
      // The old widget's photo is TripAdvisor's generic "no photo" image – leave it out.
    };
    const filter = { guestName: doc.guestName, date: doc.date, platform: doc.platform };
    const exists = await Review.exists(filter);
    log(`${exists ? "update" : "add"} review: ${doc.guestName} (${d.date}, ${doc.rating}★)`);
    if (APPLY) await Review.updateOne(filter, { $set: doc }, { upsert: true, runValidators: true });
  }
}

async function aboutLink() {
  const labels: Record<string, string> = Object.fromEntries(
    Object.entries(read("migration/zip/raw/messages.json") as Record<string, Any>).map(([l, m]) => [l, m.about?.label]).filter(([, v]) => v),
  );
  const top = await NavigationItem.find({ location: "header", parent: null }).sort({ order: 1 }).lean();
  let item = top.find((n) => n.url === "/about");
  if (item) {
    log(`menu already has About (${item.label})`);
  } else {
    // Insert just before "Contact" (or before the CTA buttons), shifting the following items down.
    const contactIdx = top.findIndex((n) => n.url === "/contact");
    const at = contactIdx >= 0 ? contactIdx : top.findIndex((n) => n.isCta);
    const order = at >= 0 ? (top[at].order ?? at + 1) : (top.at(-1)?.order ?? 0) + 1;
    log(`add menu item "About Us" → /about (order ${order}${at >= 0 ? `, before "${top[at].label}"` : ""})`);
    if (APPLY) {
      if (at >= 0) await NavigationItem.updateMany({ location: "header", parent: null, order: { $gte: order } }, { $inc: { order: 1 } });
      item = (await NavigationItem.create({ label: labels.en ?? "About Us", url: "/about", order, enabled: true, location: "header" })).toObject();
    }
  }
  if (APPLY && item) {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
      if (labels[locale]) await saveManualTranslation("navigationItem", String(item._id), locale, { fields: { label: labels[locale] } });
    }
  }
}

await connectDatabase();
try {
  await reviews();
  await aboutLink();
  console.log(APPLY ? "\nDone." : "\nDry run only – re-run with --apply to write these changes.");
} finally {
  await disconnectDatabase();
}
