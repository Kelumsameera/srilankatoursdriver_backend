import { Schema, model } from "mongoose";
import { linkSchema, mediaAssetSchema } from "./schemas/common.js";

export const SECTION_TYPES = [
  "hero",
  "whyChooseUs",
  "popularTours",
  "destinations",
  "excursions",
  "vehicles",
  "tailorMade",
  "gallery",
  "guestShorts",
  "reviews",
  "tripadvisor",
  "blog",
  "faqs",
  "richText",
  "features",
  "cta",
  "contact",
  "offer",
  "team",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

const sectionItemSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    /** Team sections: the person's role (Owner, Manager …). */
    role: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    icon: { type: String, trim: true, default: "" },
    image: mediaAssetSchema,
    url: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const pageSectionSchema = new Schema(
  {
    page: { type: Schema.Types.ObjectId, ref: "Page", required: true, index: true },
    type: { type: String, enum: SECTION_TYPES, required: true },
    name: { type: String, trim: true, default: "" },
    eyebrow: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "" },
    /** Short highlighted line: a season ("November to April") or an offer badge ("Limited offer – 30% off"). */
    badge: { type: String, trim: true, default: "" },
    /** Offer sections: price text ("$700") and what it covers ("for 2 travellers"). */
    price: { type: String, trim: true, default: "" },
    priceNote: { type: String, trim: true, default: "" },
    content: { type: String, default: "" },
    items: { type: [sectionItemSchema], default: [] },
    buttons: { type: [linkSchema], default: [] },
    media: mediaAssetSchema,
    settings: {
      limit: { type: Number, default: 6, min: 1, max: 24 },
      source: { type: String, enum: ["featured", "latest", "all"], default: "featured" },
      theme: { type: String, enum: ["light", "sand", "forest", "dark"], default: "light" },
      layout: { type: String, enum: ["grid", "carousel", "list", "split"], default: "grid" },
      /** Optional category filter for list sections (e.g. "Seasonal" or "One-day" tours). */
      category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    },
    enabled: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

pageSectionSchema.index({ page: 1, order: 1 });

export const PageSection = model("PageSection", pageSectionSchema);
