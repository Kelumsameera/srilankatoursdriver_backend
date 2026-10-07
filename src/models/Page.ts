import { Schema, model } from "mongoose";
import { mediaAssetSchema, seoSchema, auditFields } from "./schemas/common.js";

/**
 * A website page. System pages (home, tours, …) map to fixed routes; custom pages
 * (privacy-policy, about-us, …) render at /[locale]/[slug].
 */
const pageSchema = new Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: "" },
    heroImage: mediaAssetSchema,
    content: { type: String, default: "" },
    isSystem: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published"], default: "published", index: true },
    seo: { type: seoSchema, default: () => ({}) },
    ...auditFields,
  },
  { timestamps: true },
);

export const Page = model("Page", pageSchema);
