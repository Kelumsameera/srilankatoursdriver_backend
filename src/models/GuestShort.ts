import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields } from "./schemas/common.js";

/** Short guest videos (YouTube Shorts, Instagram Reels, TikTok or an uploaded file). Real guests only. */
const guestShortSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    guestName: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    platform: { type: String, enum: ["youtube", "instagram", "tiktok", "upload"], required: true },
    videoUrl: { type: String, trim: true, default: "" },
    uploadedMedia: mediaAssetSchema,
    thumbnail: mediaAssetSchema,
    description: { type: String, trim: true, default: "" },
    date: Date,
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

export const GuestShort = model("GuestShort", guestShortSchema);
