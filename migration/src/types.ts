/** Shared types for the old-website discovery / extraction pipeline. */

import type {
  BookingItemExtraction,
  BusinessExtraction,
  DestinationExtraction,
  ExcursionExtraction,
  FaqExtraction,
  FooterExtraction,
  GenericExtraction,
  InstagramItem,
  NavNode,
  ReviewExtraction,
  SectionCandidate,
} from "./extract.js";
import type { ImageRef } from "./lib/html.js";

export const PAGE_CATEGORIES = [
  "homepage",
  "page",
  "about",
  "contact",
  "faq",
  "gallery",
  "reviews",
  "tours",
  "tour-detail",
  "destination",
  "excursion",
  "vehicle",
  "blog",
  "other",
  "system",
  "asset",
] as const;
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

export interface Classification {
  category: PageCategory;
  /** Listing/archive page (e.g. /excursions/) rather than a single item. */
  isListing: boolean;
  /** Finer label, e.g. "offer", "legal", "tailor-made", "transfer-rates". */
  subtype: string | null;
  /** Pages that should not be imported (checkout, wishlist, test pages …). */
  excludeFromImport: boolean;
  reasons: string[];
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  body: string | null;
  redirects: string[];
  attempts: number;
  error: string | null;
  fromCache: boolean;
}

export interface DiscoveredUrl {
  url: string;
  classification: Classification;
  discoveredVia: string[];
  discoveredAt: string;
  robotsAllowed: boolean;
  fetched: boolean;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  skippedReason: string | null;
}

export type MediaRole =
  | "hero"
  | "gallery"
  | "content"
  | "og-image"
  | "logo"
  | "favicon"
  | "icon"
  | "avatar"
  | "background"
  | "instagram"
  | "ui-asset"
  | "video";

export interface MediaUsage {
  sourcePage: string;
  pageCategory: PageCategory;
  role: MediaRole;
  altText: string | null;
  caption: string | null;
}

export interface MediaRecord {
  sourceUrl: string;
  filename: string | null;
  extension: string | null;
  mediaType: "image" | "video" | "svg" | "document" | "embed" | "other";
  /** For WordPress size variants (-1000x565.jpg) the presumed original upload. */
  originalUrl: string;
  isSizeVariant: boolean;
  altText: string | null;
  caption: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  dimensionsSource: "html-attributes" | "filename" | "wp-api" | null;
  mimeType: string | null;
  wpMediaId: number | null;
  roles: MediaRole[];
  usedFor: PageCategory[];
  sourcePage: string;
  sourcePages: string[];
  usages: MediaUsage[];
  hostedExternally: boolean;
  excludeFromImport: boolean;
  excludeReason: string | null;
}

export interface Suspicious {
  field: string;
  reason: string;
}

export interface RecordQuality {
  status: "ok" | "partial" | "failed";
  extractedSuccessfully: boolean;
  missingFields: string[];
  suspiciousFields: Suspicious[];
  duplicateOf: string[];
  parsingErrors: string[];
  notes: string[];
}

/** A normalized record: `data` only holds fields of the EXISTING CMS model. */
export interface NormalizedRecord<T = Record<string, unknown>> {
  sourceUrl: string;
  sourceType: string;
  sourceWpId: number | null;
  targetModel: string;
  data: T;
  /** Hints for ObjectId references that can only be resolved at import time. */
  references: Record<string, unknown>;
  /** Source values that have no field in the existing schema (kept, never dropped). */
  unmapped: Record<string, unknown>;
  quality: RecordQuality;
  /** import = looks complete; review = needs a human decision first; skip = test/system/duplicate content. */
  recommendation: "import" | "review" | "skip";
  recommendationReason: string;
}

/** One fetched page of the old site with everything extracted from it (raw/*.json). */
export interface RawPage {
  sourceUrl: string;
  finalUrl: string;
  sourceType: PageCategory;
  classification: Classification;
  httpStatus: number | null;
  title: string | null;
  /** Path (relative to backend/migration) of the stored original HTML. */
  rawHtmlFile: string | null;
  rawHtmlSha256: string | null;
  rawHtmlBytes: number | null;
  extractedText: string;
  discoveredAt: string;
  fetchedAt: string | null;
  discoveredVia: string[];
  wpPostId: number | null;
  wpPostType: string | null;
  error: string | null;
  parsingErrors: string[];
  generic: Omit<GenericExtraction, "extractedText"> | null;
  booking?: BookingItemExtraction;
  excursion?: ExcursionExtraction;
  destination?: DestinationExtraction;
  faqs?: FaqExtraction[];
  reviews?: ReviewExtraction[];
  instagram?: InstagramItem[];
  galleryImages?: ImageRef[];
  business?: BusinessExtraction;
  navigation?: NavNode[];
  footer?: FooterExtraction;
  sections?: SectionCandidate[];
}
