import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields } from "./schemas/common.js";

const galleryItemSchema = new Schema(
  {
    media: { type: mediaAssetSchema, required: true },
    title: { type: String, trim: true, default: "" },
    caption: { type: String, trim: true, default: "" },
    altText: { type: String, trim: true, default: "" },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    tags: { type: [String], default: [] },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

galleryItemSchema.index({ status: 1, order: 1, createdAt: -1 });

export const GalleryItem = model("GalleryItem", galleryItemSchema);
