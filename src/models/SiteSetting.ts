import { Schema, model, type InferSchemaType } from "mongoose";
import { mediaAssetSchema } from "./schemas/common.js";

/** One row of the fixed airport-transfer price table (destinations pages). */
const transferRateSchema = new Schema(
  {
    destination: { type: String, trim: true, required: true },
    car: { type: Number, default: null },
    van: { type: Number, default: null },
    bus: { type: Number, default: null },
    duration: { type: String, trim: true, default: "" },
    distanceKm: { type: Number, default: null },
  },
  { _id: false },
);

/** Accreditation / partner logos shown in the website trust bar (SLTDA, PATA, TripAdvisor …). */
const partnerSchema = new Schema(
  {
    name: { type: String, trim: true, required: true },
    url: { type: String, trim: true, default: "" },
    logo: mediaAssetSchema,
  },
  { _id: false },
);

const footerLinkSchema = new Schema(
  { label: { type: String, trim: true, required: true }, url: { type: String, trim: true, required: true } },
  { _id: false },
);

const footerColumnSchema = new Schema(
  {
    title: { type: String, trim: true, required: true },
    links: { type: [footerLinkSchema], default: [] },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

/** Singleton document (key = "default") holding all business & footer settings. */
const siteSettingSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    siteName: { type: String, trim: true, required: true },
    businessName: { type: String, trim: true, required: true },
    tagline: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    googleMapsUrl: { type: String, trim: true, default: "" },
    mapEmbedUrl: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    whatsapp: { type: String, trim: true, default: "" },
    whatsappMessage: { type: String, trim: true, default: "Hello! I'd like to plan a tour in Sri Lanka." },
    email: { type: String, trim: true, lowercase: true, default: "" },
    businessHours: { type: String, trim: true, default: "" },
    websiteUrl: { type: String, trim: true, default: "" },
    timezone: { type: String, trim: true, default: "Asia/Colombo" },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    defaultLanguage: { type: String, trim: true, default: "en" },
    social: {
      facebook: { type: String, trim: true, default: "" },
      instagram: { type: String, trim: true, default: "" },
      youtube: { type: String, trim: true, default: "" },
      tiktok: { type: String, trim: true, default: "" },
      tripadvisor: { type: String, trim: true, default: "" },
      twitter: { type: String, trim: true, default: "" },
      linkedin: { type: String, trim: true, default: "" },
      pinterest: { type: String, trim: true, default: "" },
    },
    footer: {
      description: { type: String, trim: true, default: "" },
      columns: { type: [footerColumnSchema], default: [] },
      showTourLinks: { type: Boolean, default: true },
      showDestinationLinks: { type: Boolean, default: true },
      showSocial: { type: Boolean, default: true },
      copyright: { type: String, trim: true, default: "" },
      privacyUrl: { type: String, trim: true, default: "/privacy-policy" },
      termsUrl: { type: String, trim: true, default: "/terms-and-conditions" },
      cookieUrl: { type: String, trim: true, default: "/cookie-policy" },
    },
    tripadvisor: {
      enabled: { type: Boolean, default: false },
      profileUrl: { type: String, trim: true, default: "" },
      ratingText: { type: String, trim: true, default: "" },
    },
    partners: { type: [partnerSchema], default: [] },
    transferRates: {
      enabled: { type: Boolean, default: true },
      title: { type: String, trim: true, default: "" },
      subtitle: { type: String, trim: true, default: "" },
      currency: { type: String, trim: true, uppercase: true, default: "USD" },
      note: { type: String, trim: true, default: "" },
      rows: { type: [transferRateSchema], default: [] },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type SiteSettingAttrs = InferSchemaType<typeof siteSettingSchema>;
export const SiteSetting = model("SiteSetting", siteSettingSchema);
