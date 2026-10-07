import { Schema } from "mongoose";

/**
 * A reference to a Cloudinary asset embedded in a document.
 * Only metadata is stored – the binary lives in Cloudinary.
 */
export const mediaAssetSchema = new Schema(
  {
    mediaId: { type: Schema.Types.ObjectId, ref: "Media" },
    publicId: { type: String, trim: true },
    url: { type: String, trim: true },
    resourceType: { type: String, enum: ["image", "video"], default: "image" },
    format: String,
    width: Number,
    height: Number,
    duration: Number,
    alt: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

export const seoSchema = new Schema(
  {
    seoTitle: { type: String, trim: true, maxlength: 160 },
    metaDescription: { type: String, trim: true, maxlength: 320 },
    keywords: [{ type: String, trim: true }],
    canonicalUrl: { type: String, trim: true },
    ogTitle: { type: String, trim: true },
    ogDescription: { type: String, trim: true },
    ogImage: mediaAssetSchema,
    robots: { type: String, trim: true, default: "index,follow" },
  },
  { _id: false },
);

export const linkSchema = new Schema(
  {
    label: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    variant: { type: String, enum: ["primary", "secondary", "outline", "whatsapp", "link"], default: "primary" },
    openInNewTab: { type: Boolean, default: false },
  },
  { _id: false },
);

export const faqItemSchema = new Schema(
  {
    question: { type: String, trim: true, required: true },
    answer: { type: String, trim: true, required: true },
  },
  { _id: false },
);

export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Fields shared by most publishable content types. */
export const publishableFields = {
  status: { type: String, enum: CONTENT_STATUSES, default: "draft", index: true },
  featured: { type: Boolean, default: false, index: true },
  order: { type: Number, default: 0, index: true },
};

export const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
};
