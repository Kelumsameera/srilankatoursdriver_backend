import { Schema, model, type InferSchemaType } from "mongoose";

/** Progress of a bulk "translate every item of a type" run, which takes too long for one HTTP request. */
const translationJobSchema = new Schema(
  {
    entityType: { type: String, required: true },
    locales: { type: [String], default: [] },
    status: { type: String, enum: ["running", "done", "failed"], default: "running" },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    /** Items that could not be translated (e.g. deleted while the job ran). Per-locale errors are on each Translation. */
    failed: { type: Number, default: 0 },
    error: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    finishedAt: Date,
  },
  { timestamps: true },
);

translationJobSchema.index({ entityType: 1, status: 1 });
// Old job records are only useful for a while.
translationJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export type TranslationJobAttrs = InferSchemaType<typeof translationJobSchema>;
export const TranslationJob = model("TranslationJob", translationJobSchema);
