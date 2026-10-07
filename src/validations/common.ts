import { z } from "zod";

/**
 * NOTE: entity schemas intentionally avoid `.default()` – updates use `.partial()`
 * and Zod 4 would otherwise inject defaults and overwrite stored values.
 * Mongoose applies defaults on create.
 */

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** Accepts an id, or "" / null meaning "unset". */
export const optionalRef = z
  .union([objectId, z.literal(""), z.null()])
  .transform((v) => (v ? v : null))
  .optional();

export const optionalDate = z
  .union([z.literal(""), z.null(), z.coerce.date()])
  .transform((v) => (v instanceof Date ? v : null))
  .optional();

export const optionalNumber = z
  .union([z.number(), z.literal(""), z.null()])
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
  .optional();

const safeUrlPattern = /^(https?:\/\/|\/|#|mailto:|tel:)/i;
/** Relative paths, http(s), mailto:, tel: or empty. Blocks javascript: and data: URLs. */
export const safeUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || safeUrlPattern.test(v), "Must be a relative path or an http(s)/mailto/tel URL");

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL");

export const shortText = (max = 200) => z.string().trim().max(max);
export const longText = (max = 50_000) => z.string().max(max);
export const stringList = (maxItems = 100, maxLen = 500) => z.array(z.string().trim().max(maxLen)).max(maxItems);

export const mediaAsset = z
  .object({
    mediaId: optionalRef,
    publicId: shortText(500).optional(),
    url: httpUrl.optional(),
    resourceType: z.enum(["image", "video"]).optional(),
    format: shortText(20).optional(),
    width: optionalNumber,
    height: optionalNumber,
    duration: optionalNumber,
    alt: shortText(300).optional(),
  })
  .nullable()
  .optional();

export const seo = z
  .object({
    seoTitle: shortText(160).optional(),
    metaDescription: shortText(320).optional(),
    keywords: stringList(30, 80).optional(),
    canonicalUrl: httpUrl.optional(),
    ogTitle: shortText(160).optional(),
    ogDescription: shortText(320).optional(),
    ogImage: mediaAsset,
    robots: shortText(60).optional(),
  })
  .optional();

export const link = z.object({
  label: shortText(80).optional(),
  url: safeUrl.optional(),
  variant: z.enum(["primary", "secondary", "outline", "whatsapp", "link"]).optional(),
  openInNewTab: z.boolean().optional(),
});

export const contentStatus = z.enum(["draft", "published", "archived"]);

export const publishable = {
  status: contentStatus.optional(),
  featured: z.boolean().optional(),
  order: z.number().int().min(-100000).max(100000).optional(),
};

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and hyphens")
  .optional()
  .or(z.literal(""));

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(30).optional(),
  category: objectId.optional(),
  featured: z.enum(["true", "false"]).optional(),
  sort: z
    .string()
    .trim()
    .max(40)
    .regex(/^-?[a-zA-Z.]+$/)
    .optional(),
  kind: z.string().trim().max(30).optional(),
  type: z.string().trim().max(30).optional(),
  resourceType: z.enum(["image", "video"]).optional(),
  folder: z.string().trim().max(120).optional(),
  assignedTo: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  destination: objectId.optional(),
  platform: z.string().trim().max(30).optional(),
  locale: z.string().trim().max(5).optional(),
  page_slug: z.string().trim().max(120).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: objectId, order: z.number().int().min(-100000).max(100000) }))
    .min(1)
    .max(500),
});

export const statusSchema = z.object({
  status: z.string().trim().min(1).max(30).optional(),
  enabled: z.boolean().optional(),
  featured: z.boolean().optional(),
});

export const noteBody = z.object({ text: z.string().trim().min(1).max(4000) });
