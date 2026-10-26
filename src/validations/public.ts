import { z } from "zod";
import { CATEGORY_KINDS } from "../models/Category.js";

// Query string accepted by the public (website) API, e.g. /api/destinations?locale=de&limit=60
export const publicQuery = z.object({
  locale: z.string().max(5).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  featured: z.enum(["true", "false"]).optional(),
  category: z.string().trim().max(120).optional(),
  destination: z
    .string()
    .regex(/^[a-f0-9]{24}$/i)
    .optional(),
  search: z.string().trim().max(120).optional(),
  /** Alias of `search`. */
  q: z.string().trim().max(120).optional(),
  platform: z.enum(["youtube", "instagram", "tiktok", "upload", "website", "tripadvisor", "google", "facebook", "other"]).optional(),
  /** Tour length: 1, 5, 8, 10, 12 or 14 days, or "other" for every other length. */
  days: z.enum(["1", "5", "8", "10", "12", "14", "other"]).optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  token: z.string().max(2000).optional(),
});

export type PublicQuery = z.infer<typeof publicQuery>;

// The :slug part of a URL, e.g. /api/destinations/kandy
export const slugParam = z.object({ slug: z.string().trim().min(1).max(160) });
