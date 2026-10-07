import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields, seoSchema } from "./schemas/common.js";

const vehicleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    type: { type: String, trim: true, default: "" },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    description: { type: String, default: "" },
    images: { type: [mediaAssetSchema], default: [] },
    seats: { type: Number, min: 1, default: 3 },
    luggageCapacity: { type: Number, min: 0, default: 2 },
    airConditioning: { type: Boolean, default: true },
    features: { type: [String], default: [] },
    dailyRate: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    availability: { type: String, enum: ["available", "limited", "unavailable"], default: "available" },
    seo: { type: seoSchema, default: () => ({}) },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

vehicleSchema.index({ status: 1, order: 1 });

export const Vehicle = model("Vehicle", vehicleSchema);
