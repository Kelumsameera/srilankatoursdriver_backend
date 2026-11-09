/** Apply the supplied emblem and editable wordmark in development. Back up before changing branding. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { BrandSetting, Media } from "../models/index.js";
import { uploadImage } from "../services/cloudinary/cloudinary.service.js";
import { updateBranding } from "../services/settings.service.js";
import { brandingUpdate } from "../validations/settings.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

if (env.NODE_ENV !== "development") throw new Error("This setup helper only writes in development.");
await connectDatabase();
try {
  const before = await BrandSetting.findOne({ key: "default" }).lean();
  const folder = new URL("../../backups/", import.meta.url);
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL(`branding-before-${Date.now()}.json`, folder), JSON.stringify(before, null, 2));
  const tag = "supplied-sri-lanka-emblem-v2";
  let media = await Media.findOne({ tags: tag });
  if (!media) {
    const file = fileURLToPath(new URL("../../../frontend/public/images/branding/sri-lanka-emblem-512.png", import.meta.url));
    const uploaded = await uploadImage(file, "branding", { originalName: "sri-lanka-emblem-512.png" });
    media = await Media.create({ ...uploaded, title: "Sri Lanka Tours Driver emblem", altText: "Sri Lanka island and airplane inside a circular gradient emblem", tags: [tag, "branding"] });
  }
  const patch = brandingUpdate.parse({
    logoIcon: { mediaId: String(media._id), publicId: media.publicId, url: media.secureUrl, resourceType: "image", format: media.format, width: media.width, height: media.height, alt: media.altText },
    logoTextLine1: "SRI LANKA",
    logoTextLine2: "TOURS DRIVER",
    logoFont: "Poppins",
    logoTextColor1: "#032d55",
    logoTextColor2: "#009f91",
    logoLightTextColor1: "#ffffff",
    logoLightTextColor2: "#48d4b0",
  });
  await updateBranding(patch);
  revalidateFrontend(CACHE_TAGS.branding);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("Saved emblem and editable two-line wordmark. Other branding settings preserved.");
} finally {
  await disconnectDatabase();
}
