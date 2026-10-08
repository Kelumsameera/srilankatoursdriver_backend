import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema } from "./schemas/common.js";

export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;

/** Genuine guest reviews only – either submitted by guests or entered by admins from a real source. */
const reviewSchema = new Schema(
  {
    guestName: { type: String, required: true, trim: true, maxlength: 120 },
    country: { type: String, trim: true, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, default: "" },
    review: { type: String, required: true, trim: true, maxlength: 5000 },
    date: { type: Date, default: Date.now },
    photo: mediaAssetSchema,
    platform: { type: String, enum: ["website", "tripadvisor", "google", "facebook", "other"], default: "website" },
    sourceUrl: { type: String, trim: true, default: "" },
    tour: { type: Schema.Types.ObjectId, ref: "Tour" },
    email: { type: String, trim: true, lowercase: true, default: "", select: false },
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false, index: true },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending", index: true },
    order: { type: Number, default: 0 },
    /** Fingerprint of a public submission – repeated identical submissions are not stored twice. */
    submissionHash: { type: String, select: false },
    ...auditFields,
  },
  { timestamps: true },
);

reviewSchema.index({ status: 1, featured: -1, date: -1 });
reviewSchema.index({ submissionHash: 1, createdAt: -1 });

export const Review = model("Review", reviewSchema);
