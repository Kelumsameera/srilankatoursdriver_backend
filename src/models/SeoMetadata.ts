import { Schema, model } from "mongoose";
import { mediaAssetSchema } from "./schemas/common.js";

/**
 * Global and route-level SEO defaults. `key: "global"` holds site-wide defaults;
 * any other key (e.g. "tours", "gallery") overrides SEO for that listing route.
 * Individual tours/destinations/posts carry their own embedded `seo`.
 */
const seoMetadataSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    /** "%s" = page title, "{siteName}" = Site Settings → Site name */
    titleTemplate: { type: String, trim: true, default: "%s | {siteName}" },
    seoTitle: { type: String, trim: true, default: "" },
    metaDescription: { type: String, trim: true, default: "" },
    keywords: { type: [String], default: [] },
    canonicalUrl: { type: String, trim: true, default: "" },
    ogTitle: { type: String, trim: true, default: "" },
    ogDescription: { type: String, trim: true, default: "" },
    ogImage: mediaAssetSchema,
    twitterHandle: { type: String, trim: true, default: "" },
    robots: { type: String, trim: true, default: "index,follow" },
    googleSiteVerification: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

export const SeoMetadata = model("SeoMetadata", seoMetadataSchema);
