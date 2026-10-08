import { z } from "zod";
import {
  link,
  longText,
  mediaAsset,
  objectId,
  optionalDate,
  optionalNumber,
  optionalRef,
  publishable,
  safeUrl,
  seo,
  shortText,
  slugField,
  stringList,
  httpUrl,
} from "./common.js";
import { CATEGORY_KINDS } from "../models/Category.js";
import { SECTION_TYPES } from "../models/PageSection.js";
import { GUEST_SHORT_PLATFORMS, guestShortIssues } from "../models/GuestShort.js";

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code")
  .optional();

/* ───────────── Tours ───────────── */
const tourDay = z.object({
  _id: objectId.optional(),
  day: z.number().int().min(1).max(365),
  title: shortText(200).min(1),
  description: longText(10_000).optional(),
  location: shortText(160).optional(),
  overnight: shortText(160).optional(),
  distanceKm: optionalNumber,
  travelTime: shortText(80).optional(),
  meals: stringList(5, 40).optional(),
  activities: stringList(30, 200).optional(),
  image: mediaAsset,
});

export const tourCreate = z.object({
  title: shortText(160).min(2),
  slug: slugField,
  shortDescription: shortText(400).optional(),
  description: longText().optional(),
  heroMedia: mediaAsset,
  gallery: z.array(mediaAsset.unwrap().unwrap()).max(60).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  durationNights: z.number().int().min(0).max(365).optional(),
  price: optionalNumber,
  currency,
  priceNote: shortText(160).optional(),
  startLocation: shortText(160).optional(),
  endLocation: shortText(160).optional(),
  destinations: z.array(objectId).max(60).optional(),
  category: optionalRef,
  tourType: shortText(120).optional(),
  difficulty: z.enum(["easy", "moderate", "challenging"]).optional(),
  groupSize: shortText(80).optional(),
  highlights: stringList(40, 300).optional(),
  included: stringList(60, 300).optional(),
  excluded: stringList(60, 300).optional(),
  hotels: z
    .array(
      z.object({
        name: shortText(160).min(1),
        location: shortText(160).optional(),
        nights: z.number().int().min(0).max(60).optional(),
        category: shortText(60).optional(),
        url: httpUrl.optional(),
      }),
    )
    .max(60)
    .optional(),
  vehicle: optionalRef,
  driver: z
    .object({
      included: z.boolean().optional(),
      name: shortText(120).optional(),
      languages: stringList(15, 40).optional(),
      description: shortText(2000).optional(),
    })
    .optional(),
  itinerary: z.array(tourDay).max(365).optional(),
  faqs: z.array(z.object({ question: shortText(300).min(1), answer: longText(5000).min(1) })).max(50).optional(),
  seo,
  ...publishable,
});
export const tourUpdate = tourCreate.partial();

/* ───────────── Destinations ───────────── */
export const destinationCreate = z.object({
  name: shortText(120).min(2),
  slug: slugField,
  region: shortText(120).optional(),
  shortDescription: shortText(400).optional(),
  description: longText().optional(),
  heroMedia: mediaAsset,
  gallery: z.array(mediaAsset.unwrap().unwrap()).max(60).optional(),
  highlights: stringList(40, 300).optional(),
  thingsToDo: stringList(40, 300).optional(),
  bestTimeToVisit: shortText(200).optional(),
  location: z.object({ lat: optionalNumber, lng: optionalNumber }).optional(),
  category: optionalRef,
  seo,
  ...publishable,
});
export const destinationUpdate = destinationCreate.partial();

/* ───────────── Excursions ───────────── */
export const excursionCreate = z.object({
  title: shortText(160).min(2),
  slug: slugField,
  category: optionalRef,
  destination: optionalRef,
  location: shortText(160).optional(),
  duration: shortText(80).optional(),
  price: optionalNumber,
  currency,
  priceNote: shortText(160).optional(),
  shortDescription: shortText(400).optional(),
  description: longText().optional(),
  heroMedia: mediaAsset,
  gallery: z.array(mediaAsset.unwrap().unwrap()).max(60).optional(),
  highlights: stringList(40, 300).optional(),
  included: stringList(40, 300).optional(),
  seo,
  ...publishable,
});
export const excursionUpdate = excursionCreate.partial();

/* ───────────── Vehicles ───────────── */
export const vehicleCreate = z.object({
  name: shortText(120).min(2),
  slug: slugField,
  type: shortText(80).optional(),
  category: optionalRef,
  description: longText(10_000).optional(),
  images: z.array(mediaAsset.unwrap().unwrap()).max(30).optional(),
  seats: z.number().int().min(1).max(80).optional(),
  luggageCapacity: z.number().int().min(0).max(80).optional(),
  airConditioning: z.boolean().optional(),
  features: stringList(30, 120).optional(),
  dailyRate: optionalNumber,
  currency,
  availability: z.enum(["available", "limited", "unavailable"]).optional(),
  seo,
  ...publishable,
});
export const vehicleUpdate = vehicleCreate.partial();

/* ───────────── Categories ───────────── */
export const categoryCreate = z.object({
  kind: z.enum(CATEGORY_KINDS),
  name: shortText(80).min(1),
  slug: slugField,
  description: shortText(1000).optional(),
  icon: shortText(60).optional(),
  image: mediaAsset,
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export const categoryUpdate = categoryCreate.partial();

/* ───────────── Gallery ───────────── */
export const galleryCreate = z.object({
  media: mediaAsset.unwrap().unwrap().refine((m) => Boolean(m.url && m.publicId), "Media is required"),
  title: shortText(200).optional(),
  caption: shortText(1000).optional(),
  altText: shortText(300).optional(),
  category: optionalRef,
  tags: stringList(30, 40).optional(),
  ...publishable,
});
export const galleryUpdate = galleryCreate.partial();

/* ───────────── Blog ───────────── */
export const blogCreate = z.object({
  title: shortText(200).min(2),
  slug: slugField,
  excerpt: shortText(500).optional(),
  content: longText(200_000).optional(),
  coverImage: mediaAsset,
  author: shortText(120).optional(),
  category: optionalRef,
  tags: stringList(30, 40).optional(),
  publishDate: optionalDate,
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  featured: z.boolean().optional(),
  order: z.number().int().optional(),
  seo,
});
export const blogUpdate = blogCreate.partial();

/* ───────────── Guest shorts ───────────── */
const guestShortBase = z.object({
  title: shortText(200).min(1),
  guestName: shortText(120).optional(),
  country: shortText(80).optional(),
  platform: z.enum(GUEST_SHORT_PLATFORMS),
  videoUrl: httpUrl.optional(),
  uploadedMedia: mediaAsset,
  thumbnail: mediaAsset,
  description: shortText(2000).optional(),
  date: optionalDate,
  ...publishable,
});

/**
 * platform = "upload"                     → uploadedMedia (a Cloudinary video) is required, no URL needed
 * platform = youtube | instagram | tiktok → an https link on that platform is required, no upload needed
 * Updates are checked again on the merged document by the GuestShort model.
 */
export const guestShortCreate = guestShortBase.superRefine((v, ctx) => {
  for (const issue of guestShortIssues(v)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
});
export const guestShortUpdate = guestShortBase.partial().superRefine((v, ctx) => {
  // Without the platform we cannot judge the URL here; the model validates the merged result.
  if (!v.platform) return;
  for (const issue of guestShortIssues(v)) {
    // Only complain about fields the request actually touches – the rest is validated on save.
    if (issue.path in v) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
});

/* ───────────── Reviews ───────────── */
export const reviewCreate = z.object({
  guestName: shortText(120).min(1),
  country: shortText(80).optional(),
  rating: z.number().int().min(1).max(5),
  title: shortText(200).optional(),
  review: shortText(5000).min(5),
  date: optionalDate,
  photo: mediaAsset,
  platform: z.enum(["website", "tripadvisor", "google", "facebook", "other"]).optional(),
  sourceUrl: httpUrl.optional(),
  tour: optionalRef,
  verified: z.boolean().optional(),
  featured: z.boolean().optional(),
  status: z.enum(["pending", "published", "rejected"]).optional(),
  order: z.number().int().optional(),
});
export const reviewUpdate = reviewCreate.partial();

/** Public review submission – always lands as pending & unverified. */
export const publicReviewSubmit = z.object({
  guestName: shortText(120).min(2),
  country: shortText(80).optional(),
  email: z.email().max(254),
  rating: z.number().int().min(1).max(5),
  title: shortText(200).optional(),
  review: shortText(5000).min(20),
  tour: optionalRef,
  website: z.string().max(500).optional(), // honeypot – filled in by bots only (silently discarded)
});

/* ───────────── FAQs ───────────── */
export const faqCreate = z.object({
  question: shortText(300).min(3),
  answer: longText(10_000).min(1),
  category: shortText(80).optional(),
  ...publishable,
});
export const faqUpdate = faqCreate.partial();

/* ───────────── Hero ───────────── */
export const heroCreate = z.object({
  title: shortText(200).min(1),
  subtitle: shortText(300).optional(),
  description: shortText(1000).optional(),
  desktopImage: mediaAsset,
  mobileImage: mediaAsset,
  video: mediaAsset,
  button1: link.optional(),
  button2: link.optional(),
  overlay: z.boolean().optional(),
  overlayColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center"]).optional(),
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
  featured: z.boolean().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
});
export const heroUpdate = heroCreate.partial();

/* ───────────── Navigation ───────────── */
export const navigationCreate = z.object({
  label: shortText(80).min(1),
  url: safeUrl.optional(),
  parent: optionalRef,
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
  openInNewTab: z.boolean().optional(),
  isCta: z.boolean().optional(),
  icon: shortText(40).optional(),
});
export const navigationUpdate = navigationCreate.partial();

/* ───────────── Pages & sections ───────────── */
export const pageCreate = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: shortText(200).min(1),
  subtitle: shortText(500).optional(),
  heroImage: mediaAsset,
  content: longText(200_000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  seo,
});
export const pageUpdate = pageCreate.partial();

const sectionItem = z.object({
  title: shortText(200).optional(),
  role: shortText(120).optional(),
  description: shortText(2000).optional(),
  icon: shortText(40).optional(),
  image: mediaAsset,
  url: safeUrl.optional(),
});

export const sectionCreate = z.object({
  type: z.enum(SECTION_TYPES),
  name: shortText(120).optional(),
  eyebrow: shortText(120).optional(),
  title: shortText(200).optional(),
  subtitle: shortText(1000).optional(),
  badge: shortText(120).optional(),
  price: shortText(40).optional(),
  priceNote: shortText(120).optional(),
  content: longText(50_000).optional(),
  items: z.array(sectionItem).max(30).optional(),
  buttons: z.array(link).max(4).optional(),
  media: mediaAsset,
  settings: z
    .object({
      limit: z.number().int().min(1).max(24).optional(),
      source: z.enum(["featured", "latest", "all"]).optional(),
      theme: z.enum(["light", "sand", "forest", "dark"]).optional(),
      layout: z.enum(["grid", "carousel", "list", "split"]).optional(),
      category: optionalRef,
    })
    .optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().optional(),
});
export const sectionUpdate = sectionCreate.partial();

/* ───────────── SEO metadata ───────────── */
export const seoMetadataCreate = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),
  titleTemplate: shortText(160).optional(),
  seoTitle: shortText(160).optional(),
  metaDescription: shortText(320).optional(),
  keywords: stringList(30, 80).optional(),
  canonicalUrl: httpUrl.optional(),
  ogTitle: shortText(160).optional(),
  ogDescription: shortText(320).optional(),
  ogImage: mediaAsset,
  twitterHandle: shortText(60).optional(),
  robots: shortText(60).optional(),
  googleSiteVerification: shortText(120).optional(),
});
export const seoMetadataUpdate = seoMetadataCreate.partial();
