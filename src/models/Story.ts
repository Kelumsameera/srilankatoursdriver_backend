import { Schema, model } from "mongoose";
import { auditFields, mediaAssetSchema } from "./schemas/common.js";

export const STORY_STATUSES = ["pending", "published", "rejected"] as const;
/** Photos per story (a video, when there is one, counts as one of them) */
export const MAX_STORY_MEDIA = 6;

/**
 * A travel story shared by a signed-in website guest: text plus photos (and later a video / reel).
 * Stories wait as "pending" until an admin publishes them.
 */
const storySchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: "Customer", index: true },
    /** Name shown on the story (copied from the customer when the story is written) */
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    /** Where it happened, e.g. "Ella" (free text) */
    place: { type: String, trim: true, default: "", maxlength: 120 },
    media: { type: [mediaAssetSchema], default: [] },
    status: { type: String, enum: STORY_STATUSES, default: "pending", index: true },
    featured: { type: Boolean, default: false },
    /** Set when the story is first published – the feed is sorted by it */
    publishedAt: { type: Date, index: true },
    ...auditFields,
  },
  { timestamps: true },
);

storySchema.index({ status: 1, publishedAt: -1 });

// The first time an admin publishes a story, remember when (the feed shows newest first)
storySchema.pre("save", function () {
  if (this.status === "published" && !this.publishedAt) this.publishedAt = new Date();
});

export const Story = model("Story", storySchema);
