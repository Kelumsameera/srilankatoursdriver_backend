import { Schema, model } from "mongoose";
import { linkSchema, mediaAssetSchema, auditFields } from "./schemas/common.js";

/** A homepage hero slide (image and/or video). */
const heroMediaSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    desktopImage: mediaAssetSchema,
    mobileImage: mediaAssetSchema,
    video: mediaAssetSchema,
    button1: { type: linkSchema, default: () => ({}) },
    button2: { type: linkSchema, default: () => ({ variant: "outline" }) },
    overlay: { type: Boolean, default: true },
    overlayColor: { type: String, default: "#06261b" },
    overlayOpacity: { type: Number, default: 0.45, min: 0, max: 1 },
    textAlign: { type: String, enum: ["left", "center"], default: "left" },
    order: { type: Number, default: 0, index: true },
    enabled: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false },
    startDate: Date,
    endDate: Date,
    ...auditFields,
  },
  { timestamps: true },
);

export const HeroMedia = model("HeroMedia", heroMediaSchema);
