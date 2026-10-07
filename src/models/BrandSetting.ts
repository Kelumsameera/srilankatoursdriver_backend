import { Schema, model } from "mongoose";
import { mediaAssetSchema } from "./schemas/common.js";

/** Singleton (key = "default") for logos, favicon and brand colours. */
const brandSettingSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    primaryLogo: mediaAssetSchema,
    lightLogo: mediaAssetSchema,
    darkLogo: mediaAssetSchema,
    mobileLogo: mediaAssetSchema,
    favicon: mediaAssetSchema,
    logoAlt: { type: String, trim: true, default: "" },
    logoWidth: { type: Number, default: 180, min: 40, max: 600 },
    logoHeight: { type: Number, default: 56, min: 16, max: 300 },
    colors: {
      primary: { type: String, default: "#0f3d2e" },
      secondary: { type: String, default: "#1f7a4d" },
      accent: { type: String, default: "#c99a3b" },
    },
  },
  { timestamps: true },
);

export const BrandSetting = model("BrandSetting", brandSettingSchema);
