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
    /** Icon + text logo. When the icon or the first line is set, the site shows these instead of the logo images. */
    logoIcon: mediaAssetSchema,
    logoTextLine1: { type: String, trim: true, default: "" },
    logoTextLine2: { type: String, trim: true, default: "" },
    logoFont: { type: String, enum: ["Poppins", "Playfair Display", "Arial", "Georgia"], default: "Poppins" },
    logoTextColor1: { type: String, default: "#032d55" },
    logoTextColor2: { type: String, default: "#009f91" },
    logoLightTextColor1: { type: String, default: "#ffffff" },
    logoLightTextColor2: { type: String, default: "#48d4b0" },
    logoAlt: { type: String, trim: true, default: "" },
    logoWidth: { type: Number, default: 180, min: 40, max: 600 },
    logoHeight: { type: Number, default: 56, min: 16, max: 300 },
    colors: {
      primary: { type: String, default: "#0f3d2e" },
      secondary: { type: String, default: "#1f7a4d" },
      accent: { type: String, default: "#c99a3b" },
    },
    /**
     * Site Appearance settings (validations/theme.ts). Stored as one object; fields that are missing fall back to
     * the frontend defaults, so documents saved before this field existed need no migration.
     */
    theme: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

export const BrandSetting = model("BrandSetting", brandSettingSchema);
