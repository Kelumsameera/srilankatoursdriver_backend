import { Schema, model } from "mongoose";
import { auditFields } from "./schemas/common.js";
import { ENGAGEMENT_TARGETS } from "./Like.js";

export const COMMENT_STATUSES = ["pending", "published", "rejected"] as const;

/** A comment by a signed-in website customer on a blog post or a guest story. New comments wait for an admin. */
const commentSchema = new Schema(
  {
    targetModel: { type: String, enum: ENGAGEMENT_TARGETS, required: true },
    target: { type: Schema.Types.ObjectId, refPath: "targetModel", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    /** Name shown next to the comment (copied from the customer when the comment is written) */
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: COMMENT_STATUSES, default: "pending", index: true },
    ...auditFields,
  },
  { timestamps: true },
);

commentSchema.index({ target: 1, status: 1, createdAt: 1 });

export const Comment = model("Comment", commentSchema);
