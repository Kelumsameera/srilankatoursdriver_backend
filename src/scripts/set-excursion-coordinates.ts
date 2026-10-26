/**
 * Sets the map pin (lat / lng) of each excursion, shown on the Sri Lanka map of the excursion page
 * and editable in Admin → Excursions → Map location. Only fills excursions that have no pin yet.
 *
 *   npx tsx src/scripts/set-excursion-coordinates.ts          dry run: prints what would be saved
 *   npx tsx src/scripts/set-excursion-coordinates.ts --apply  backs up, then saves
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Excursion } from "../models/Excursion.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const apply = process.argv.includes("--apply");

// Town centres (WGS84), same values as the destinations where one exists
const COORDINATES: Record<string, { lat: number; lng: number }> = {
  "colombo-airport": { lat: 7.1808, lng: 79.8841 },
  colombo: { lat: 6.9271, lng: 79.8612 },
  kandy: { lat: 7.2906, lng: 80.6337 },
  galle: { lat: 6.0329, lng: 80.2168 },
  ella: { lat: 6.8667, lng: 81.0466 },
  "nuwara-eliya": { lat: 6.9497, lng: 80.7891 },
  sigiriya: { lat: 7.957, lng: 80.7603 },
  anuradhapura: { lat: 8.3114, lng: 80.4037 },
  polonnaruwa: { lat: 7.9403, lng: 81.0188 },
  mirissa: { lat: 5.9483, lng: 80.4716 },
  hikkaduwa: { lat: 6.1395, lng: 80.1063 },
  trincomalee: { lat: 8.5874, lng: 81.2152 },
  pasikuda: { lat: 7.93, lng: 81.56 },
  tissamaharama: { lat: 6.2786, lng: 81.2876 },
  udawalawa: { lat: 6.474, lng: 80.8985 },
  negombo: { lat: 7.2083, lng: 79.8358 },
  kalutara: { lat: 6.5854, lng: 79.9607 },
  jaffna: { lat: 9.6615, lng: 80.0255 },
};

await connectDatabase();
const excursions = await Excursion.find({}).select("slug title coordinates").lean();

const changes = excursions
  .filter((e) => COORDINATES[e.slug] && e.coordinates?.lat == null)
  .map((e) => ({ _id: e._id, slug: e.slug, coordinates: COORDINATES[e.slug] }));
const missing = excursions.filter((e) => !COORDINATES[e.slug]).map((e) => e.slug);

for (const c of changes) console.log(`${c.slug}: ${c.coordinates.lat}, ${c.coordinates.lng}`);
if (missing.length) console.log(`\nNo coordinates known for: ${missing.join(", ")}`);

if (!apply) {
  console.log(`\nDry run – ${changes.length} excursions would get a map pin. Re-run with --apply to save.`);
  await disconnectDatabase();
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
writeFileSync(`backups/excursion-coordinates-before-${Date.now()}.json`, JSON.stringify(excursions, null, 2));

for (const c of changes) await Excursion.updateOne({ _id: c._id }, { $set: { coordinates: c.coordinates } });
console.log(`Saved ${changes.length} map pins.`);

revalidateFrontend(CACHE_TAGS.excursions);
await new Promise((r) => setTimeout(r, 2000));
await disconnectDatabase();
