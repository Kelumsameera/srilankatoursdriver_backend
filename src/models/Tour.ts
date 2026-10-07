import { Schema, model } from "mongoose";
import { auditFields, faqItemSchema, mediaAssetSchema, publishableFields, seoSchema } from "./schemas/common.js";
import { tourDaySchema } from "./TourDay.js";

const hotelSchema = new Schema(
  {
    name: { type: String, trim: true, required: true },
    location: { type: String, trim: true, default: "" },
    nights: { type: Number, default: 1, min: 0 },
    category: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const tourSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    shortDescription: { type: String, trim: true, default: "", maxlength: 400 },
    description: { type: String, default: "" },
    heroMedia: mediaAssetSchema,
    gallery: { type: [mediaAssetSchema], default: [] },
    durationDays: { type: Number, min: 1, default: 1 },
    durationNights: { type: Number, min: 0, default: 0 },
    price: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    priceNote: { type: String, trim: true, default: "" },
    startLocation: { type: String, trim: true, default: "" },
    endLocation: { type: String, trim: true, default: "" },
    destinations: [{ type: Schema.Types.ObjectId, ref: "Destination" }],
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    tourType: { type: String, trim: true, default: "Private chauffeur-guided tour" },
    difficulty: { type: String, enum: ["easy", "moderate", "challenging"], default: "easy" },
    groupSize: { type: String, trim: true, default: "" },
    highlights: { type: [String], default: [] },
    included: { type: [String], default: [] },
    excluded: { type: [String], default: [] },
    hotels: { type: [hotelSchema], default: [] },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    driver: {
      included: { type: Boolean, default: true },
      name: { type: String, trim: true, default: "" },
      languages: { type: [String], default: [] },
      description: { type: String, trim: true, default: "" },
    },
    itinerary: { type: [tourDaySchema], default: [] },
    faqs: { type: [faqItemSchema], default: [] },
    seo: { type: seoSchema, default: () => ({}) },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

tourSchema.index({ status: 1, featured: -1, order: 1 });
tourSchema.index({ title: "text", shortDescription: "text" });

export const Tour = model("Tour", tourSchema);
