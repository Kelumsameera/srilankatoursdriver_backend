import { Schema, model } from "mongoose";

/** What can be liked or commented on: a blog post or a guest story. `targetModel` is the Mongoose model name. */
export const ENGAGEMENT_TARGETS = ["BlogPost", "Story"] as const;

/** One "like" by a signed-in website customer (a customer can like the same post or story once). */
const likeSchema = new Schema(
  {
    targetModel: { type: String, enum: ENGAGEMENT_TARGETS, required: true },
    target: { type: Schema.Types.ObjectId, refPath: "targetModel", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
  },
  { timestamps: true },
);

likeSchema.index({ target: 1, customer: 1 }, { unique: true });

export const Like = model("Like", likeSchema);
