import { z } from "zod";
import { httpUrl, mapEmbedUrl, mediaAsset, safeUrl, shortText } from "./common.js";
import { SUPPORTED_LOCALES } from "../config/locales.js";
import { themeSettings } from "./theme.js";

const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s()-]*$|^$/, "Invalid phone number");

const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

/** One destination row of a transfer price table (airport rates and excursion rates). */
const transferRateRow = z.object({
  destination: shortText(120).min(1),
  car: z.number().min(0).max(100_000_000).nullable().optional(),
  van: z.number().min(0).max(100_000_000).nullable().optional(),
  bus: z.number().min(0).max(100_000_000).nullable().optional(),
  duration: shortText(80).optional(),
  distanceKm: z.number().min(0).max(5000).nullable().optional(),
});

export const siteSettingsUpdate = z
  .object({
    siteName: shortText(120).min(1),
    businessName: shortText(160).min(1),
    tagline: shortText(300),
    address: shortText(400),
    googleMapsUrl: httpUrl,
    mapEmbedUrl,
    phone,
    whatsapp: phone,
    whatsappMessage: shortText(500),
    email: z.email().max(254).or(z.literal("")),
    businessHours: shortText(200),
    websiteUrl: httpUrl,
    timezone: shortText(60),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    defaultLanguage: z.enum(SUPPORTED_LOCALES),
    social: z
      .object({
        facebook: httpUrl,
        instagram: httpUrl,
        youtube: httpUrl,
        tiktok: httpUrl,
        tripadvisor: httpUrl,
        twitter: httpUrl,
        linkedin: httpUrl,
        pinterest: httpUrl,
      })
      .partial(),
    footer: z
      .object({
        description: shortText(1000),
        columns: z
          .array(
            z.object({
              title: shortText(80).min(1),
              enabled: z.boolean().optional(),
              links: z.array(z.object({ label: shortText(80).min(1), url: safeUrl.refine((v) => v.length > 0, "URL required") })).max(20),
            }),
          )
          .max(6),
        showTourLinks: z.boolean(),
        showDestinationLinks: z.boolean(),
        showSocial: z.boolean(),
        copyright: shortText(300),
        privacyUrl: safeUrl,
        termsUrl: safeUrl,
        cookieUrl: safeUrl,
      })
      .partial(),
    tripadvisor: z
      .object({
        enabled: z.boolean(),
        profileUrl: httpUrl,
        ratingText: shortText(200),
      })
      .partial(),
    transferRates: z
      .object({
        enabled: z.boolean(),
        title: shortText(120),
        subtitle: shortText(200),
        currency: currencyCode,
        note: shortText(400),
        rows: z.array(transferRateRow).max(80),
      })
      .partial(),
    excursionRates: z
      .object({
        enabled: z.boolean(),
        title: shortText(120),
        subtitle: shortText(200),
        currency: currencyCode,
        note: shortText(400),
        tables: z.array(z.object({ origin: shortText(120).min(1), rows: z.array(transferRateRow).max(80) })).max(40),
      })
      .partial(),
    partners: z.array(z.object({ name: shortText(120).min(1), url: httpUrl.optional(), logo: mediaAsset })).max(20),
    maintenanceMode: z.boolean(),
  })
  .partial();

/** Each line of the text logo ("SRI LANKA" / "TOURS DRIVER") – short enough to fit next to the icon on a phone. */
export const LOGO_TEXT_MAX = 30;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #0f3d2e");

export const brandingUpdate = z
  .object({
    primaryLogo: mediaAsset,
    lightLogo: mediaAsset,
    darkLogo: mediaAsset,
    mobileLogo: mediaAsset,
    favicon: mediaAsset,
    logoIcon: mediaAsset,
    logoTextLine1: shortText(LOGO_TEXT_MAX),
    logoTextLine2: shortText(LOGO_TEXT_MAX),
    logoAlt: shortText(200),
    logoWidth: z.number().int().min(40).max(600),
    logoHeight: z.number().int().min(16).max(300),
    colors: z.object({ primary: hexColor, secondary: hexColor, accent: hexColor }).partial(),
    /** Site Appearance page: colours, fonts, background, shape and custom CSS (replaced as a whole on save). */
    theme: themeSettings,
  })
  .partial();

export const languageUpdate = z.object({
  languages: z
    .array(
      z.object({
        code: z.enum(SUPPORTED_LOCALES),
        enabled: z.boolean(),
        order: z.number().int().optional(),
      }),
    )
    .min(1),
  /** Language for visitors whose browser language is not enabled (and for x-default). */
  defaultLanguage: z.enum(SUPPORTED_LOCALES).optional(),
});
