import { z } from "zod";
import { SUPPORTED_LOCALES } from "../config/locales.js";

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Page-view beacon from the public site. */
export const trackBody = z.object({
  path: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s?#]*$/, "Must be a site path"),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  referrer: z.string().trim().max(2048).optional(),
  utmSource: z.string().trim().max(80).optional(),
  session: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  /** First view of the browser session (entry page) – carries the traffic source. */
  entry: z.boolean().optional(),
});

export const analyticsQuery = z.object({
  range: z.enum(ANALYTICS_RANGES).default("30d"),
});

/** Admin edits to a website customer account. */
export const customerAdminUpdate = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** A guest is addressed by email (there is no guest record of its own). */
export const guestParams = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Corrected contact details, applied to all of a guest's records. */
export const guestUpdate = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    whatsapp: z.string().trim().max(40).optional(),
    country: z.string().trim().max(80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
