import { Schema, model } from "mongoose";

/**
 * Admin override of one website UI string (a key from frontend/messages/<locale>.json, e.g. "nav.tours").
 * The website uses the override instead of the bundled text for that language.
 */
const uiMessageSchema = new Schema(
  {
    locale: { type: String, required: true, lowercase: true, trim: true },
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

uiMessageSchema.index({ locale: 1, key: 1 }, { unique: true });

export const UiMessage = model("UiMessage", uiMessageSchema);
