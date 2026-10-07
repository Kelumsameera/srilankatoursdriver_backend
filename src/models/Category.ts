import { Schema, model } from "mongoose";
import { mediaAssetSchema } from "./schemas/common.js";

export const CATEGORY_KINDS = ["tour", "destination", "excursion", "vehicle", "blog", "gallery", "faq"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * Categories for every content type. Blog categories are `kind: "blog"`
 * (exported as BlogCategory below for clarity).
 */
const categorySchema = new Schema(
  {
    kind: { type: String, enum: CATEGORY_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: "" },
    icon: { type: String, trim: true, default: "" },
    image: mediaAssetSchema,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.index({ kind: 1, slug: 1 }, { unique: true });

export const Category = model("Category", categorySchema);
/** Alias – blog categories live in the shared Category collection with kind "blog". */
export const BlogCategory = Category;
