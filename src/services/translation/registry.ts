import type { Model } from "mongoose";
import {
  BlogPost,
  Category,
  Destination,
  Excursion,
  FAQ,
  GalleryItem,
  GuestShort,
  HeroMedia,
  NavigationItem,
  Page,
  PageSection,
  SiteSetting,
  Tour,
  Vehicle,
} from "../../models/index.js";
import { CACHE_TAGS } from "../revalidate.service.js";

export interface TranslatableEntity {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  /** Field used as a human label in the admin translation list. */
  titleField: string;
  /** Dotted paths to translate; `*` expands over array indexes. */
  fields: string[];
  cacheTag: string;
}

const seoFields = ["seo.seoTitle", "seo.metaDescription", "seo.ogTitle", "seo.ogDescription"];

/**
 * Which content is translated and which fields. English is the source language;
 * reviews and guest names are intentionally never machine-translated (authenticity).
 */
export const TRANSLATABLE: Record<string, TranslatableEntity> = {
  tour: {
    label: "Tours",
    model: Tour,
    titleField: "title",
    cacheTag: CACHE_TAGS.tours,
    fields: [
      "title",
      "shortDescription",
      "description",
      "tourType",
      "priceNote",
      "groupSize",
      "highlights.*",
      "included.*",
      "excluded.*",
      "itinerary.*.title",
      "itinerary.*.description",
      "itinerary.*.activities.*",
      "itinerary.*.travelTime",
      "driver.description",
      "faqs.*.question",
      "faqs.*.answer",
      ...seoFields,
    ],
  },
  destination: {
    label: "Destinations",
    model: Destination,
    titleField: "name",
    cacheTag: CACHE_TAGS.destinations,
    fields: ["name", "region", "shortDescription", "description", "highlights.*", "thingsToDo.*", "bestTimeToVisit", ...seoFields],
  },
  excursion: {
    label: "Excursions",
    model: Excursion,
    titleField: "title",
    cacheTag: CACHE_TAGS.excursions,
    fields: ["title", "shortDescription", "description", "duration", "priceNote", "highlights.*", "included.*", ...seoFields],
  },
  vehicle: {
    label: "Vehicles",
    model: Vehicle,
    titleField: "name",
    cacheTag: CACHE_TAGS.vehicles,
    fields: ["type", "description", "features.*", ...seoFields],
  },
  blogPost: {
    label: "Blog posts",
    model: BlogPost,
    titleField: "title",
    cacheTag: CACHE_TAGS.blog,
    fields: ["title", "excerpt", "content", ...seoFields],
  },
  faq: { label: "FAQs", model: FAQ, titleField: "question", cacheTag: CACHE_TAGS.faqs, fields: ["question", "answer", "category"] },
  heroMedia: {
    label: "Hero slides",
    model: HeroMedia,
    titleField: "title",
    cacheTag: CACHE_TAGS.hero,
    fields: ["title", "subtitle", "description", "button1.label", "button2.label"],
  },
  page: {
    label: "Pages",
    model: Page,
    titleField: "title",
    cacheTag: CACHE_TAGS.pages,
    fields: ["title", "subtitle", "content", ...seoFields],
  },
  pageSection: {
    label: "Page sections",
    model: PageSection,
    titleField: "title",
    cacheTag: CACHE_TAGS.pages,
    fields: ["eyebrow", "title", "subtitle", "badge", "priceNote", "content", "items.*.title", "items.*.role", "items.*.description", "buttons.*.label"],
  },
  navigationItem: { label: "Navigation", model: NavigationItem, titleField: "label", cacheTag: CACHE_TAGS.navigation, fields: ["label"] },
  category: { label: "Categories", model: Category, titleField: "name", cacheTag: CACHE_TAGS.categories, fields: ["name", "description"] },
  galleryItem: {
    label: "Gallery",
    model: GalleryItem,
    titleField: "title",
    cacheTag: CACHE_TAGS.gallery,
    fields: ["title", "caption", "altText"],
  },
  guestShort: { label: "Guest shorts", model: GuestShort, titleField: "title", cacheTag: CACHE_TAGS.guestShorts, fields: ["title", "description"] },
  siteSetting: {
    label: "Site settings & footer",
    model: SiteSetting,
    titleField: "siteName",
    cacheTag: CACHE_TAGS.settings,
    fields: [
      "tagline",
      "businessHours",
      "whatsappMessage",
      "footer.description",
      "footer.copyright",
      "footer.columns.*.title",
      "footer.columns.*.links.*.label",
      "transferRates.title",
      "transferRates.subtitle",
      "transferRates.note",
      "transferRates.rows.*.destination",
      "transferRates.rows.*.duration",
      "tripadvisor.ratingText",
    ],
  },
};

export type TranslatableType = keyof typeof TRANSLATABLE;

export function isTranslatableType(t: string): t is TranslatableType {
  return Object.prototype.hasOwnProperty.call(TRANSLATABLE, t);
}

/** Expands `*` patterns against a document and returns every non-empty string leaf. */
export function extractFields(doc: unknown, patterns: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown, parts: string[], prefix: string) => {
    if (value === null || value === undefined) return;
    if (parts.length === 0) {
      if (typeof value === "string" && value.trim().length > 0) out[prefix] = value;
      return;
    }
    const [head, ...rest] = parts;
    if (head === "*") {
      if (!Array.isArray(value)) return;
      value.forEach((item, i) => walk(item, rest, prefix ? `${prefix}.${i}` : String(i)));
      return;
    }
    if (typeof value !== "object") return;
    walk((value as Record<string, unknown>)[head], rest, prefix ? `${prefix}.${head}` : head);
  };
  for (const p of patterns) walk(doc, p.split("."), "");
  return out;
}
