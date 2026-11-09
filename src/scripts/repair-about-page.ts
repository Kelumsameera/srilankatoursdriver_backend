/** Restore the existing About page and owner profile without inventing team identities. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Media, Page, PageSection } from "../models/index.js";
import { uploadImage } from "../services/cloudinary/cloudinary.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const apply = process.argv.includes("--apply");
if (apply && env.NODE_ENV !== "development") throw new Error("This helper only writes in development.");
await connectDatabase();
try {
  const page = await Page.findOne({ slug: "about" });
  if (!page) throw new Error("About page not found");
  const team = await PageSection.findOne({ page: page._id, type: "team" });
  if (!team) throw new Error("Existing About team section not found");
  if (!apply) {
    console.log(`Would publish About page (${page.status}) with ${team.items.length} existing team profile(s) and restore its story image.`);
  } else {
    const backup = new URL("../../backups/", import.meta.url);
    mkdirSync(backup, { recursive: true });
    writeFileSync(new URL(`about-before-${Date.now()}.json`, backup), JSON.stringify({ page: page.toObject(), team: team.toObject() }, null, 2));
    if (!page.heroImage?.url) {
      const tag = "about-story-scenic-road-v1";
      let media = await Media.findOne({ tags: tag });
      if (!media) {
        const file = fileURLToPath(new URL("../../../frontend/public/images/editorial/private-driver-scenic-road.webp", import.meta.url));
        const asset = await uploadImage(file, "pages", { originalName: "about-sri-lanka-scenic-road.webp" });
        media = await Media.create({ ...asset, title: "Sri Lanka scenic journey", altText: "AI-generated illustrative view of a winding road through Sri Lanka's hill country", tags: [tag, "ai-generated", "about"] });
      }
      page.set("heroImage", { mediaId: media._id, publicId: media.publicId, url: media.secureUrl, resourceType: "image", format: media.format, width: media.width, height: media.height, alt: media.altText });
    }
    page.status = "published";
    await page.save();
    const { people } = JSON.parse(readFileSync(new URL("../../content/about-team.json", import.meta.url), "utf8")) as {
      people: Array<{ title: string; role: string; description: string }>;
    };
    for (const person of people) {
      const existing = team.items.find((item) => item.title === person.title);
      if (existing) { existing.role = person.role; existing.description = person.description; }
      else team.items.push(person);
    }
    team.enabled = true;
    await team.save();
    revalidateFrontend(CACHE_TAGS.pages);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Restored published About content and existing owner profile. No unverified people added.");
  }
} finally {
  await disconnectDatabase();
}
