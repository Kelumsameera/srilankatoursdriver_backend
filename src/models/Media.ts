import { Schema, model, type InferSchemaType } from "mongoose";

/** Media library record. The file itself is stored in Cloudinary – never in MongoDB. */
const mediaSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    secureUrl: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video"], required: true, index: true },
    format: { type: String, default: "" },
    width: Number,
    height: Number,
    duration: Number,
    bytes: { type: Number, default: 0 },
    folder: { type: String, default: "", index: true },
    originalFilename: { type: String, default: "" },
    altText: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    caption: { type: String, trim: true, default: "" },
    tags: { type: [String], default: [], index: true },
    version: Number,
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ title: "text", originalFilename: "text", altText: "text" });

export type MediaAttrs = InferSchemaType<typeof mediaSchema>;
export const Media = model("Media", mediaSchema);
