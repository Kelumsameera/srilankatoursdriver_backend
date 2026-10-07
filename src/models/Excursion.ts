import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields, seoSchema } from "./schemas/common.js";

const excursionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    destination: { type: Schema.Types.ObjectId, ref: "Destination" },
    location: { type: String, trim: true, default: "" },
    duration: { type: String, trim: true, default: "" },
    price: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    priceNote: { type: String, trim: true, default: "" },
    shortDescription: { type: String, trim: true, default: "", maxlength: 400 },
    description: { type: String, default: "" },
    heroMedia: mediaAssetSchema,
    gallery: { type: [mediaAssetSchema], default: [] },
    highlights: { type: [String], default: [] },
    included: { type: [String], default: [] },
    seo: { type: seoSchema, default: () => ({}) },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

excursionSchema.index({ status: 1, featured: -1, order: 1 });

export const Excursion = model("Excursion", excursionSchema);
