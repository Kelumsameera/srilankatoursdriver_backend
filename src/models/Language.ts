import { Schema, model } from "mongoose";

const languageSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    nativeName: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    rtl: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Language = model("Language", languageSchema);
