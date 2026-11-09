/** Record owner-confirmed award years; no inferred annual awards. Dry-run by default. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { SiteSetting } from "../models/SiteSetting.js";
import { siteSettingsUpdate } from "../validations/settings.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const apply = process.argv.includes("--apply");
if (apply && env.NODE_ENV !== "development") throw new Error("This helper only writes in development.");
const { awards } = JSON.parse(readFileSync(new URL("../../content/tripadvisor-awards.json", import.meta.url), "utf8"));
const patch = siteSettingsUpdate.parse({ tripadvisor: { awards } });
await connectDatabase();
try {
  const settings = await SiteSetting.findOne({ key: "default" });
  if (!settings) throw new Error("Site settings not found");
  if (apply) {
    const backup = new URL("../../backups/", import.meta.url);
    mkdirSync(backup, { recursive: true });
    writeFileSync(new URL(`tripadvisor-before-${Date.now()}.json`, backup), JSON.stringify(settings.tripadvisor, null, 2));
    settings.set("tripadvisor.awards", patch.tripadvisor?.awards);
    await settings.save();
    revalidateFrontend(CACHE_TAGS.settings);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`${apply ? "Saved" : "Validated"} ${awards.length} Tripadvisor award years; review settings preserved.`);
} finally {
  await disconnectDatabase();
}
