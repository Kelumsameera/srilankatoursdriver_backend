import type { Model, PopulateOptions } from "mongoose";
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
  Review,
  SeoMetadata,
  Tour,
  Vehicle,
} from "../models/index.js";
import type { CategoryKind } from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex } from "../utils/helpers.js";
import { localize, localizeOne } from "./translation/translation.service.js";
import type { TranslatableType } from "./translation/registry.js";
import { getTripAdvisorSummary, isTripAdvisorConfigured } from "./tripadvisor/tripadvisor.service.js";
import { getUsdRates, toUsd } from "./currency.service.js";

type AnyRecord = Record<string, unknown>;

const PRICED = new Set<string>(["tours", "excursions", "vehicles"]);

/** The public site shows every price in USD (Admin may enter LKR etc.). */
async function pricesInUsd<T extends AnyRecord>(key: string, docs: T[]): Promise<T[]> {
  if (!PRICED.has(key) || docs.length === 0) return docs;
  const rates = await getUsdRates();
  return docs.map((d) => toUsd(d, rates));
}

const HIDDEN = "-createdBy -updatedBy -__v";
const categoryPopulate: PopulateOptions = { path: "category", select: "name slug kind" };

interface PublicResource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  translatable?: TranslatableType;
  /** Category slugs are only unique per kind, so `?category=<slug>` is looked up within this kind. */
  categoryKind?: CategoryKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: () => Record<string, any>;
  sort: Record<string, 1 | -1>;
  listSelect?: string;
  populate?: PopulateOptions[];
  searchFields?: string[];
}

/** Public visibility rules. Drafts, archived, disabled and future-dated content never leave the API. */
export const PUBLIC_RESOURCES = {
  tours: {
    model: Tour,
    translatable: "tour",
    categoryKind: "tour",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, createdAt: -1 },
    listSelect:
      // itinerary.location: lets cards show the real day-by-day route without loading full itineraries.
      "title slug shortDescription heroMedia durationDays durationNights price currency priceNote groupPrices startLocation endLocation category tourType difficulty featured highlights destinations itinerary.location",
    populate: [categoryPopulate, { path: "destinations", select: "name slug", match: { status: "published" } }],
    searchFields: ["title", "shortDescription"],
  },
  destinations: {
    model: Destination,
    translatable: "destination",
    categoryKind: "destination",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, name: 1 },
    listSelect: "name slug region tagline shortDescription heroMedia featured category location order",
    populate: [categoryPopulate],
    searchFields: ["name", "region", "shortDescription"],
  },
  excursions: {
    model: Excursion,
    translatable: "excursion",
    categoryKind: "excursion",
    filter: () => ({ status: "published" }),
    // A-Z by name, so visitors can find their starting place
    sort: { title: 1 },
    listSelect: "title slug shortDescription heroMedia duration price currency priceNote location category featured destination",
    populate: [categoryPopulate],
    searchFields: ["title", "location"],
  },
  vehicles: {
    model: Vehicle,
    translatable: "vehicle",
    categoryKind: "vehicle",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1 },
    populate: [categoryPopulate],
  },
  gallery: {
    model: GalleryItem,
    translatable: "galleryItem",
    categoryKind: "gallery",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, createdAt: -1 },
    populate: [categoryPopulate],
  },
  blog: {
    model: BlogPost,
    translatable: "blogPost",
    categoryKind: "blog",
    filter: () => ({
      $or: [{ status: "published" }, { status: "scheduled" }],
      publishDate: { $lte: new Date() },
    }),
    sort: { publishDate: -1 },
    listSelect: "title slug excerpt coverImage author category tags publishDate featured readingMinutes",
    populate: [categoryPopulate],
    searchFields: ["title", "excerpt", "tags"],
  },
  guestShorts: {
    model: GuestShort,
    translatable: "guestShort",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, date: -1 },
  },
  reviews: {
    model: Review,
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, date: -1 },
    populate: [{ path: "tour", select: "title slug" }],
  },
  faqs: {
    model: FAQ,
    translatable: "faq",
    filter: () => ({ status: "published" }),
    sort: { order: 1, createdAt: 1 },
  },
} satisfies Record<string, PublicResource>;

export type PublicResourceKey = keyof typeof PUBLIC_RESOURCES;

interface PublicListOptions {
  locale?: string;
  page?: number;
  limit?: number;
  featured?: boolean;
  category?: string;
  destination?: string;
  search?: string;
  platform?: string;
}

export async function listPublic(key: PublicResourceKey, opts: PublicListOptions = {}) {
  const cfg = PUBLIC_RESOURCES[key] as PublicResource;
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 12, 60);
  const filter: AnyRecord = { ...cfg.filter() };
  if (opts.featured) filter.featured = true;
  if (opts.category) {
    // Accept a category id or slug.
    if (/^[a-f0-9]{24}$/i.test(opts.category)) filter.category = opts.category;
    else {
      const kindFilter = cfg.categoryKind ? { kind: cfg.categoryKind } : {};
      const cat = await Category.findOne({ slug: opts.category, ...kindFilter }).select("_id").lean();
      filter.category = cat?._id ?? null;
    }
  }
  if (opts.destination) filter[key === "tours" ? "destinations" : "destination"] = opts.destination;
  if (opts.platform) filter.platform = opts.platform;
  if (opts.search && cfg.searchFields) {
    const rx = new RegExp(escapeRegex(opts.search), "i");
    filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: cfg.searchFields.map((f) => ({ [f]: rx })) }];
  }

  if (key === "tours") return listToursBySeason(cfg, filter, page, limit, opts.locale);

  let query = cfg.model
    .find(filter)
    .select(cfg.listSelect ?? HIDDEN)
    .sort(cfg.sort)
    .skip((page - 1) * limit)
    .limit(limit);
  for (const p of cfg.populate ?? []) query = query.populate(p);
  const [rows, total] = await Promise.all([query.lean(), cfg.model.countDocuments(filter)]);
  const localized = cfg.translatable ? await localize(cfg.translatable, rows as AnyRecord[], opts.locale) : rows;
  const items = await pricesInUsd(key, localized as AnyRecord[]);
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

/**
 * Seasonal tour packages: Down South runs November–June, East Coast July–October (Sri Lanka time).
 * The tours that are in season now come first, day tours and the rest sit in the middle,
 * and the out-of-season packages go to the end. Each tour carries its `seasonRank`
 * (0 in season, 1 day tour, 2 other, 3 off season) so the site can group the cards.
 */
const SEASONAL_TOUR_CATEGORIES = { downSouth: "down-south-tours", eastCoast: "east-coast-tours" };
const DAY_TOUR_CATEGORY = "day-tours";

export function seasonalTourCategories(now = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Colombo", month: "numeric" }).format(now));
  const eastCoastSeason = month >= 7 && month <= 10;
  return eastCoastSeason
    ? { inSeason: SEASONAL_TOUR_CATEGORIES.eastCoast, offSeason: SEASONAL_TOUR_CATEGORIES.downSouth }
    : { inSeason: SEASONAL_TOUR_CATEGORIES.downSouth, offSeason: SEASONAL_TOUR_CATEGORIES.eastCoast };
}

async function listToursBySeason(cfg: PublicResource, filter: AnyRecord, page: number, limit: number, locale?: string) {
  const { inSeason, offSeason } = seasonalTourCategories();
  const cats = await Category.find({ kind: "tour", slug: { $in: [inSeason, offSeason, DAY_TOUR_CATEGORY] } }).select("_id slug").lean();
  const ranks: [string, number][] = [[inSeason, 0], [DAY_TOUR_CATEGORY, 1], [offSeason, 3]];
  const branches = ranks.flatMap(([slug, rank]) => {
    const id = cats.find((c) => c.slug === slug)?._id;
    return id ? [{ case: { $eq: ["$category", id] }, then: rank }] : [];
  });
  const project = Object.fromEntries((cfg.listSelect ?? "").split(/\s+/).filter(Boolean).map((f) => [f, 1]));

  // aggregate() skips Mongoose casting, so string ids in the filter (category, destination) are cast here
  const match = Tour.find().cast(Tour, filter);
  const rows = await Tour.aggregate([
    { $match: match },
    {
      $addFields: {
        seasonRank: branches.length ? { $switch: { branches, default: 2 } } : 2,
      },
    },
    // Seasonal packages run shortest to longest (5, 8, 10, 12, 14 days)
    { $addFields: { seasonDays: { $cond: [{ $in: ["$seasonRank", [0, 3]] }, { $ifNull: ["$durationDays", 0] }, 0] } } },
    { $sort: { seasonRank: 1, seasonDays: 1, ...cfg.sort, _id: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $project: { ...project, seasonRank: 1 } },
  ]);
  const [populated, total] = await Promise.all([Tour.populate(rows, cfg.populate ?? []), Tour.countDocuments(filter)]);
  const localized = await localize("tour", populated as unknown as AnyRecord[], locale);
  const items = await pricesInUsd("tours", localized);
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function localizeCategories<T extends AnyRecord>(docs: T[], locale?: string): Promise<T[]> {
  const cats = docs.map((d) => d.category as AnyRecord | undefined).filter((c): c is AnyRecord => Boolean(c && c._id));
  if (cats.length === 0) return docs;
  const localized = await localize("category", cats, locale);
  const byId = new Map(localized.map((c) => [String(c._id), c]));
  return docs.map((d) => (d.category ? { ...d, category: byId.get(String((d.category as AnyRecord)._id)) ?? d.category } : d));
}

export async function listPublicLocalized(key: PublicResourceKey, opts: PublicListOptions = {}) {
  const result = await listPublic(key, opts);
  return { ...result, items: await localizeCategories(result.items as AnyRecord[], opts.locale) };
}

export async function getPublicBySlug(key: "tours" | "destinations" | "excursions" | "vehicles" | "blog", slug: string, locale?: string) {
  const cfg = PUBLIC_RESOURCES[key] as PublicResource;
  let query = cfg.model.findOne({ ...cfg.filter(), slug: slug.toLowerCase() }).select(HIDDEN);
  query = query.populate(categoryPopulate);
  if (key === "tours") {
    query = query
      .populate({ path: "destinations", select: "name slug shortDescription heroMedia region", match: { status: "published" } })
      .populate({ path: "vehicle", select: "name slug type seats luggageCapacity images airConditioning features", match: { status: "published" } });
  }
  if (key === "excursions") query = query.populate({ path: "destination", select: "name slug", match: { status: "published" } });
  const doc = (await query.lean()) as AnyRecord | null;
  if (!doc) throw ApiError.notFound("Not found");

  let out = cfg.translatable ? ((await localizeOne(cfg.translatable, doc as AnyRecord & { _id: unknown }, locale)) as AnyRecord) : doc;
  [out] = await localizeCategories([out], locale);
  if (key === "tours") {
    if (Array.isArray(out.destinations)) out = { ...out, destinations: await localize("destination", out.destinations as AnyRecord[], locale) };
    if (out.vehicle) out = { ...out, vehicle: await localizeOne("vehicle", out.vehicle as AnyRecord, locale) };
  }

  // Related items for detail pages.
  const related = await cfg.model
    .find({ ...cfg.filter(), _id: { $ne: doc._id }, ...(doc.category ? { category: (doc.category as AnyRecord)._id } : {}) })
    .select(cfg.listSelect ?? HIDDEN)
    .sort(cfg.sort)
    .limit(3)
    .lean();
  const relatedLocalized = cfg.translatable ? await localize(cfg.translatable, related as AnyRecord[], locale) : related;
  [out] = await pricesInUsd(key, [out]);
  return { item: out, related: await pricesInUsd(key, relatedLocalized as AnyRecord[]) };
}

export async function listCategories(kind: string, locale?: string) {
  // Draft-only and unused categories must not lead visitors to empty tour lists.
  const publishedCategories = kind === "tour"
    ? await Tour.distinct("category", { status: "published" })
    : undefined;
  const rows = await Category.find({
    kind: kind as CategoryKind,
    enabled: true,
    ...(publishedCategories ? { _id: { $in: publishedCategories } } : {}),
  }).sort({ order: 1, name: 1 }).select("-__v").lean();
  return localize("category", rows as AnyRecord[], locale);
}

export async function getNavigation(locale?: string) {
  const rows = await NavigationItem.find({ enabled: true, location: "header" }).sort({ order: 1 }).select("-__v -createdAt -updatedAt").lean();
  const localized = await localize("navigationItem", rows as AnyRecord[], locale);
  // Build a tree (unlimited nesting).
  const byId = new Map<string, AnyRecord & { children: AnyRecord[] }>();
  localized.forEach((r) => byId.set(String(r._id), { ...r, children: [] }));
  const roots: AnyRecord[] = [];
  byId.forEach((node) => {
    const parentId = node.parent ? String(node.parent) : null;
    if (parentId && byId.has(parentId)) byId.get(parentId)!.children.push(node);
    else if (!parentId) roots.push(node);
  });
  return roots;
}

export async function getActiveHeroSlides(locale?: string) {
  const now = new Date();
  const rows = await HeroMedia.find({
    enabled: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] },
    ],
  })
    .sort({ featured: -1, order: 1 })
    .select(HIDDEN)
    .lean();
  return localize("heroMedia", rows as AnyRecord[], locale);
}

/**
 * Adds the latest TripAdvisor reviews (live from the Content API, cached 6 h in the service) to a
 * reviews section, newest first, so new TripAdvisor reviews appear on the site automatically.
 * They are not stored in MongoDB; ones already imported as CMS reviews (same guest name) are skipped.
 */
async function withLiveTripAdvisor(items: unknown[], limit: number): Promise<unknown[]> {
  if (!isTripAdvisorConfigured()) return items;
  const ta = await getTripAdvisorSummary();
  const known = new Set((items as AnyRecord[]).map((r) => String(r.guestName ?? "").trim().toLowerCase()));
  const live = ta.reviews
    .filter((r) => r.text && !known.has(r.user.username.trim().toLowerCase()))
    .map((r) => ({
      _id: `tripadvisor-${r.id}`,
      guestName: r.user.username,
      country: r.user.country ?? "",
      rating: r.rating,
      title: r.title,
      review: r.text,
      date: r.publishedDate,
      platform: "tripadvisor",
      sourceUrl: r.url,
      verified: true,
      live: true,
    }));
  if (!live.length) return items;
  const byDate = (r: AnyRecord) => new Date(String(r.date ?? 0)).getTime() || 0;
  return [...live, ...(items as AnyRecord[])].sort((a, b) => byDate(b) - byDate(a)).slice(0, Math.max(limit, live.length));
}

/** Loads the data each dynamic section needs, so a page renders from a single API call. */
async function resolveSectionData(section: AnyRecord, locale?: string): Promise<unknown> {
  const settings = (section.settings ?? {}) as { limit?: number; source?: string; category?: unknown };
  const limit = settings.limit ?? 6;
  const featured = settings.source === "featured";
  const category = settings.category ? String(settings.category) : undefined;
  const fetchList = async (key: PublicResourceKey) => {
    let r = await listPublicLocalized(key, { locale, limit, featured, category });
    if (featured && r.items.length === 0) r = await listPublicLocalized(key, { locale, limit, category }); // graceful fallback
    return r.items;
  };
  switch (section.type) {
    case "hero":
      return getActiveHeroSlides(locale);
    case "popularTours":
      return fetchList("tours");
    case "destinations":
      return fetchList("destinations");
    case "excursions":
      return fetchList("excursions");
    case "vehicles":
      return fetchList("vehicles");
    case "gallery":
      return fetchList("gallery");
    case "guestShorts":
      return fetchList("guestShorts");
    case "reviews":
      return withLiveTripAdvisor(await fetchList("reviews"), limit);
    case "blog":
      return fetchList("blog");
    case "faqs":
      return fetchList("faqs");
    case "tripadvisor":
      return getTripAdvisorSummary();
    default:
      return null;
  }
}

export async function getPublicPage(slug: string, locale?: string, opts: { preview?: boolean } = {}) {
  const page = await Page.findOne({ slug: slug.toLowerCase(), ...(opts.preview ? {} : { status: "published" }) })
    .select(HIDDEN)
    .lean();
  if (!page) throw ApiError.notFound("Page not found");
  const sections = await PageSection.find({ page: page._id, ...(opts.preview ? {} : { enabled: true }) })
    .sort({ order: 1 })
    .select("-__v -createdAt -updatedAt")
    .lean();
  const [localizedPage, localizedSections] = await Promise.all([
    localizeOne("page", page as AnyRecord & { _id: unknown }, locale),
    localize("pageSection", sections as AnyRecord[], locale),
  ]);
  const withData = await Promise.all(localizedSections.map(async (s) => ({ ...s, data: await resolveSectionData(s, locale) })));
  return { page: localizedPage, sections: withData };
}

export async function getSeo(key: string) {
  const [global, route] = await Promise.all([
    SeoMetadata.findOne({ key: "global" }).select("-__v").lean(),
    key === "global" ? null : SeoMetadata.findOne({ key }).select("-__v").lean(),
  ]);
  return { global, route };
}

/** Slugs + timestamps for sitemap.xml generation on the frontend. */
export async function getSitemapData() {
  const pick = "slug updatedAt";
  const [tours, destinations, excursions, vehicles, blog, pages] = await Promise.all([
    Tour.find({ status: "published" }).select(pick).lean(),
    Destination.find({ status: "published" }).select(pick).lean(),
    Excursion.find({ status: "published" }).select(pick).lean(),
    Vehicle.find({ status: "published" }).select(pick).lean(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (BlogPost as Model<any>).find(PUBLIC_RESOURCES.blog.filter()).select(pick).lean(),
    Page.find({ status: "published", isSystem: false }).select(pick).lean(),
  ]);
  const map = (rows: unknown[]) => (rows as { slug: string; updatedAt?: Date }[]).map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }));
  return {
    tours: map(tours),
    destinations: map(destinations),
    excursions: map(excursions),
    vehicles: map(vehicles),
    blog: map(blog),
    pages: map(pages),
  };
}
