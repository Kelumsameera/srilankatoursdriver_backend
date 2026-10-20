import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category } from "../models/index.js";
import { loadTourImport } from "./import-tours.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

try {
  const { categories } = loadTourImport();
  await connectDatabase();
  const rows = await Category.find({ kind: "tour", slug: { $in: categories.map((c) => c.slug) } }).lean();
  const missing = rows.filter((row) => !row.description?.trim());
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), categories: missing.map((row) => row.slug) }));
  if (process.argv.includes("--apply") && missing.length) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/category-descriptions-${Date.now()}.json`, JSON.stringify(rows, null, 2));
    for (const row of missing) {
      const description = categories.find((c) => c.slug === row.slug)?.description;
      if (!description?.trim()) throw new Error(`Missing source description: ${row.slug}`);
      const result = await Category.updateOne({ _id: row._id, updatedAt: row.updatedAt }, { $set: { description } }, { runValidators: true });
      if (result.matchedCount !== 1) throw new Error(`Concurrent category edit: ${row.slug}`);
    }
    revalidateFrontend(CACHE_TAGS.categories, CACHE_TAGS.tours);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
