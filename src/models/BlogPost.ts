import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, seoSchema } from "./schemas/common.js";

export const BLOG_STATUSES = ["draft", "published", "scheduled", "archived"] as const;

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    excerpt: { type: String, trim: true, default: "", maxlength: 500 },
    content: { type: String, default: "" },
    coverImage: mediaAssetSchema,
    author: { type: String, trim: true, default: "" },
    authorUser: { type: Schema.Types.ObjectId, ref: "User" },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    tags: { type: [String], default: [], index: true },
    publishDate: { type: Date, default: Date.now, index: true },
    status: { type: String, enum: BLOG_STATUSES, default: "draft", index: true },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    readingMinutes: { type: Number, default: 1 },
    seo: { type: seoSchema, default: () => ({}) },
    ...auditFields,
  },
  { timestamps: true },
);

blogPostSchema.pre("save", function () {
  const words = (this.content ?? "").split(/\s+/).filter(Boolean).length;
  this.readingMinutes = Math.max(1, Math.round(words / 220));
});

export const BlogPost = model("BlogPost", blogPostSchema);
