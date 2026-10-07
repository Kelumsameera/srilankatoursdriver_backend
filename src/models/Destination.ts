import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields, seoSchema } from "./schemas/common.js";

const destinationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    region: { type: String, trim: true, default: "" },
    shortDescription: { type: String, trim: true, default: "", maxlength: 400 },
    description: { type: String, default: "" },
    heroMedia: mediaAssetSchema,
    gallery: { type: [mediaAssetSchema], default: [] },
    highlights: { type: [String], default: [] },
    thingsToDo: { type: [String], default: [] },
    bestTimeToVisit: { type: String, trim: true, default: "" },
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    seo: { type: seoSchema, default: () => ({}) },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

destinationSchema.index({ status: 1, featured: -1, order: 1 });

export const Destination = model("Destination", destinationSchema);
