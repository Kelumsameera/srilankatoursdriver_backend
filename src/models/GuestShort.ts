import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema, publishableFields } from "./schemas/common.js";
import { isPlatformUrl } from "../utils/url.js";

export const GUEST_SHORT_PLATFORMS = ["youtube", "instagram", "tiktok", "upload"] as const;
export type GuestShortPlatform = (typeof GUEST_SHORT_PLATFORMS)[number];

interface GuestShortShape {
  platform?: string;
  videoUrl?: string | null;
  uploadedMedia?: { url?: string | null; publicId?: string | null; resourceType?: string | null } | null;
}

/**
 * Platform rules shared by the Zod schemas and the model (so updates, duplicates and status
 * changes are checked against the final document too):
 * - upload    → uploadedMedia must be a Cloudinary video (url + publicId); videoUrl is not needed
 * - youtube / instagram / tiktok → videoUrl must be an https link on that platform; no upload needed
 */
export function guestShortIssues(v: GuestShortShape): { path: "videoUrl" | "uploadedMedia"; message: string }[] {
  if (v.platform === "upload") {
    const m = v.uploadedMedia;
    if (!m?.url || !m.publicId) return [{ path: "uploadedMedia", message: "Upload a video when the platform is 'upload'" }];
    if (m.resourceType && m.resourceType !== "video") return [{ path: "uploadedMedia", message: "The uploaded file must be a video" }];
    return [];
  }
  if (!v.platform) return [];
  if (!v.videoUrl) return [{ path: "videoUrl", message: `Paste the ${v.platform} link for this short` }];
  if (!isPlatformUrl(v.platform, v.videoUrl)) return [{ path: "videoUrl", message: `Must be an https link on ${v.platform}` }];
  return [];
}

/** Short guest videos (YouTube Shorts, Instagram Reels, TikTok or an uploaded file). Real guests only. */
const guestShortSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    guestName: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    platform: { type: String, enum: GUEST_SHORT_PLATFORMS, required: true },
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

guestShortSchema.pre("validate", function () {
  const shape: GuestShortShape = {
    platform: this.get("platform"),
    videoUrl: this.get("videoUrl"),
    uploadedMedia: this.get("uploadedMedia") as GuestShortShape["uploadedMedia"],
  };
  for (const issue of guestShortIssues(shape)) this.invalidate(issue.path, issue.message);
});

export const GuestShort = model("GuestShort", guestShortSchema);
