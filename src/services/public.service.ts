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
import { getTripAdvisorSummary } from "./tripadvisor/tripadvisor.service.js";

type AnyRecord = Record<string, unknown>;

const HIDDEN = "-createdBy -updatedBy -__v";
const categoryPopulate: PopulateOptions = { path: "category", select: "name slug kind" };

interface PublicResource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  translatable?: TranslatableType;
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
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, createdAt: -1 },
    listSelect:
      "title slug shortDescription heroMedia durationDays durationNights price currency priceNote startLocation endLocation category tourType difficulty featured highlights destinations",
    populate: [categoryPopulate, { path: "destinations", select: "name slug", match: { status: "published" } }],
    searchFields: ["title", "shortDescription"],
  },
  destinations: {
    model: Destination,
    translatable: "destination",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, name: 1 },
    listSelect: "name slug region shortDescription heroMedia featured category location",
    populate: [categoryPopulate],
    searchFields: ["name", "region"],
  },
  excursions: {
    model: Excursion,
    translatable: "excursion",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, createdAt: -1 },
    listSelect: "title slug shortDescription heroMedia duration price currency priceNote location category featured destination",
    populate: [categoryPopulate],
    searchFields: ["title", "location"],
  },
  vehicles: {
    model: Vehicle,
    translatable: "vehicle",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1 },
    populate: [categoryPopulate],
  },
  gallery: {
    model: GalleryItem,
    translatable: "galleryItem",
    filter: () => ({ status: "published" }),
    sort: { featured: -1, order: 1, createdAt: -1 },
    populate: [categoryPopulate],
  },
  blog: {
    model: BlogPost,
    translatable: "blogPost",
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
      const cat = await Category.findOne({ slug: opts.category }).select("_id").lean();
      filter.category = cat?._id ?? null;
    }
  }
  if (opts.destination) filter[key === "tours" ? "destinations" : "destination"] = opts.destination;
  if (opts.platform) filter.platform = opts.platform;
  if (opts.search && cfg.searchFields) {
    const rx = new RegExp(escapeRegex(opts.search), "i");
    filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: cfg.searchFields.map((f) => ({ [f]: rx })) }];
  }

  let query = cfg.model
    .find(filter)
    .select(cfg.listSelect ?? HIDDEN)
    .sort(cfg.sort)
    .skip((page - 1) * limit)
    .limit(limit);
  for (const p of cfg.populate ?? []) query = query.populate(p);
  const [rows, total] = await Promise.all([query.lean(), cfg.model.countDocuments(filter)]);
  const items = cfg.translatable ? await localize(cfg.translatable, rows as AnyRecord[], opts.locale) : rows;
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

async function localizeCategories<T extends AnyRecord>(docs: T[], locale?: string): Promise<T[]> {
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
  return { item: out, related: relatedLocalized };
}

export async function listCategories(kind: string, locale?: string) {
  const rows = await Category.find({ kind: kind as CategoryKind, enabled: true }).sort({ order: 1, name: 1 }).select("-__v").lean();
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

/** Loads the data each dynamic section needs, so a page renders from a single API call. */
async function resolveSectionData(section: AnyRecord, locale?: string): Promise<unknown> {
  const settings = (section.settings ?? {}) as { limit?: number; source?: string };
  const limit = settings.limit ?? 6;
  const featured = settings.source === "featured";
  const fetchList = async (key: PublicResourceKey) => {
    let r = await listPublicLocalized(key, { locale, limit, featured });
    if (featured && r.items.length === 0) r = await listPublicLocalized(key, { locale, limit }); // graceful fallback
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
      return fetchList("reviews");
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
