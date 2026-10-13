import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields, seoSchema } from "./schemas/common.js";
import { isSafeHref } from "../utils/url.js";

const experienceSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, default: "", maxlength: 2000 },
  image: mediaAssetSchema,
  detailUrl: { type: String, trim: true, default: "", validate: (v: string) => !v || isSafeHref(v) },
  /** false = editorial suggestion that still needs a fact check before it is relied on. */
  verified: { type: Boolean, default: true },
});

const itineraryStopSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
  },
  { _id: false },
);

const destinationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    region: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "", maxlength: 200 },
    /** One-line eyebrow shown above the hero title. */
    tagline: { type: String, trim: true, default: "", maxlength: 160 },
    shortDescription: { type: String, trim: true, default: "", maxlength: 400 },
    description: { type: String, default: "" },
    heroMedia: mediaAssetSchema,
    gallery: { type: [mediaAssetSchema], default: [] },
    highlights: { type: [String], default: [] },
    thingsToDo: { type: [String], default: [] },
    featuredExperiences: { type: [experienceSchema], default: [], validate: (v: unknown[]) => v.length <= 30 },
    bestTimeToVisit: { type: String, trim: true, default: "" },
    howToGetThere: { type: String, trim: true, default: "", maxlength: 2000 },
    itinerary: { type: [itineraryStopSchema], default: [], validate: (v: unknown[]) => v.length <= 14 },
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
