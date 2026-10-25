/**
 * Applies content/tour-group-prices.json (from "Tours package prices.xlsx") to the coast packages:
 * sets each tour's price list, and its "from" price to the one-traveller price. Backs up first.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Tour } from "../models/Tour.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
import type { GroupPrice } from "../utils/group-price.js";

const data = JSON.parse(readFileSync(new URL("../../content/tour-group-prices.json", import.meta.url), "utf8")) as {
  currency: string;
  tours: Record<string, GroupPrice[]>;
};

await connectDatabase();

const slugs = Object.keys(data.tours);
const before = await Tour.find({ slug: { $in: slugs } }).select("slug price currency priceNote groupPrices").lean();
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/tour-prices-before-group-prices-${Date.now()}.json`, JSON.stringify(before, null, 2));

for (const slug of slugs) {
  const rows = [...data.tours[slug]].sort((a, b) => a.persons - b.persons);
  const r = await Tour.updateOne({ slug }, { $set: { groupPrices: rows, price: rows[0].price, currency: data.currency, priceNote: "" } });
  console.log(r.matchedCount ? `${slug}: from ${rows[0].price}, ${rows.length} rows` : `${slug}: tour not found`);
}

revalidateFrontend(CACHE_TAGS.tours);
await new Promise((resolve) => setTimeout(resolve, 2000));
await disconnectDatabase();
