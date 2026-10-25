/**
 * Loads the "Transfers from <origin>" price tables (one .txt per origin, copied from the old site)
 * into Site settings → excursionRates, shown on the excursions page and editable in Admin → Rates.
 *
 *   npx tsx src/scripts/set-excursion-rates.ts [folder]          dry run: prints what would be saved
 *   npx tsx src/scripts/set-excursion-rates.ts [folder] --apply  backs up, then saves
 *
 * folder defaults to ../rates (next to the backend and frontend folders).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { SiteSetting } from "../models/SiteSetting.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
import { originFromFileName, parseRateTable } from "../utils/excursion-rates.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const folder = resolve(args.find((a) => !a.startsWith("--")) ?? "../rates");

const NOTE =
  "Prices are for pick-up and drop-off only – sightseeing stops along the way can be arranged on request. " +
  "Pay in rupees or any foreign currency at the day's conversion rate. 5% discount for cars, 3% for vans.";

const tables = readdirSync(folder)
  .filter((f) => f.toLowerCase().endsWith(".txt"))
  .map((f) => ({ origin: originFromFileName(f), rows: parseRateTable(readFileSync(join(folder, f), "utf8")) }))
  // Airport first (most bookings start there), the rest A–Z.
  .sort((a, b) => Number(b.origin.startsWith("Airport")) - Number(a.origin.startsWith("Airport")) || a.origin.localeCompare(b.origin));

for (const t of tables) console.log(`${t.origin}: ${t.rows.length} destinations`);

if (!apply) {
  console.log(`\nDry run – ${tables.length} tables parsed from ${folder}. Re-run with --apply to save.`);
  process.exit(0);
}

await connectDatabase();
const doc = await SiteSetting.findOne({ key: "default" });
if (!doc) throw new Error("Site settings have not been initialised. Run `npm run seed`.");

mkdirSync("backups", { recursive: true });
writeFileSync(`backups/excursion-rates-before-${Date.now()}.json`, JSON.stringify(doc.get("excursionRates") ?? null, null, 2));

doc.set("excursionRates", { enabled: true, title: "", subtitle: "", currency: "LKR", note: NOTE, tables });
await doc.save();
console.log(`Saved ${tables.length} tables.`);

revalidateFrontend(CACHE_TAGS.settings);
await new Promise((r) => setTimeout(r, 2000));
await disconnectDatabase();
