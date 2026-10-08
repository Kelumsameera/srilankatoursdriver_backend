import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Translated field values for one entity in one locale.
 * `fields` maps a dotted path in the English source (e.g. "itinerary.2.title") to its translation.
 */
const translationSchema = new Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    locale: { type: String, required: true },
    fields: { type: Map, of: String, default: {} },
    /** Hash of each English source value at translation time – used to detect outdated fields. */
    sourceHashes: { type: Map, of: String, default: {} },
    /** Hash over all source fields – quick "is anything outdated?" check. */
    sourceHash: { type: String, default: "" },
    origin: { type: String, enum: ["machine", "manual"], default: "machine" },
    provider: { type: String, default: "" },
    locked: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    translatedAt: { type: Date, default: Date.now },
    /** Last machine-translation failure for this locale (cleared on the next successful run or manual save). */
    lastError: { type: String, default: "" },
    lastErrorAt: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

translationSchema.index({ entityType: 1, entityId: 1, locale: 1 }, { unique: true });

export type TranslationAttrs = InferSchemaType<typeof translationSchema>;
export const Translation = model("Translation", translationSchema);
