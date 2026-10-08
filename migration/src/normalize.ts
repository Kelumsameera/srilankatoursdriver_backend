import slugifyLib from "slugify";
import type { BusinessExtraction, ItineraryStep, NavNode, Sourced } from "./extract.js";
import type { ImageRef } from "./lib/html.js";
import { MediaCollector, wpOriginalUrl } from "./lib/media.js";
import { cleanText, comparableText, parseDuration, truncate } from "./lib/text.js";
import { isInternalUrl, normalizeUrl, slugFromUrl, toSitePath } from "./lib/url.js";
import type { NormalizedRecord, RawPage, RecordQuality, Suspicious } from "./types.js";

const slugifyFn = slugifyLib as unknown as (s: string, o?: object) => string;

/** Same rules as backend/src/utils/helpers.ts → slugify (kept local so no app module is imported). */
export function cmsSlugify(input: string): string {
  return slugifyFn(input, { lower: true, strict: true, trim: true }).slice(0, 120) || "item";
}

/** The CMS slug validator: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max 120. */
export function isValidCmsSlug(slug: string | null | undefined): boolean {
  return Boolean(slug) && slug!.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug!);
}

export interface WpApiData {
  siteName: string | null;
  siteDescription: string | null;
  posts: { id: number; slug: string; link: string; date: string; modified: string; title?: { rendered?: string }; excerpt?: { rendered?: string }; content?: { rendered?: string }; status?: string }[];
  pages: { id: number; slug: string; link: string; date: string; modified: string; parent?: number; title?: { rendered?: string } }[];
}

export interface NormalizeContext {
  media: MediaCollector;
  /** item URL → tour-category names (from the old listing pages that link to it). */
  listingMembership: Map<string, Set<string>>;
  /** item URL → homepage block headings that feature it. */
  homepageFeatures: Map<string, Set<string>>;
  wp: WpApiData;
}

/* ───────────── helpers ───────────── */

type Missing = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "number" && Number.isNaN(v));
}

export function buildQuality(required: Missing, opts: { suspicious?: Suspicious[]; parsingErrors?: string[]; notes?: string[] } = {}): RecordQuality {
  const missingFields = Object.entries(required)
    .filter(([, v]) => isEmpty(v))
    .map(([k]) => k);
  const parsingErrors = opts.parsingErrors ?? [];
  return {
    status: parsingErrors.length ? "failed" : missingFields.length ? "partial" : "ok",
    extractedSuccessfully: parsingErrors.length === 0,
    missingFields,
    suspiciousFields: opts.suspicious ?? [],
    duplicateOf: [],
    parsingErrors,
    notes: opts.notes ?? [],
  };
}

function recommend(page: RawPage | null, q: RecordQuality, extraReview: string[] = []): Pick<NormalizedRecord, "recommendation" | "recommendationReason"> {
  if (page?.classification.excludeFromImport) return { recommendation: "skip", recommendationReason: page.classification.reasons.join("; ") || "excluded" };
  if (q.status === "failed") return { recommendation: "review", recommendationReason: `parsing errors: ${q.parsingErrors.join("; ")}` };
  const reasons = [...extraReview, ...q.suspiciousFields.map((s) => `${s.field}: ${s.reason}`)];
  if (q.missingFields.length) reasons.unshift(`missing: ${q.missingFields.join(", ")}`);
  return reasons.length ? { recommendation: "review", recommendationReason: reasons.join("; ") } : { recommendation: "import", recommendationReason: "all important fields extracted" };
}

/** Embedded mediaAsset shape of the CMS (url = old-site URL until the Cloudinary upload phase). */
export function mediaAsset(ctx: NormalizeContext, url: string | null | undefined, alt?: string | null): Record<string, unknown> | null {
  const n = normalizeUrl(url);
  if (!n) return null;
  const rec = ctx.media.list().find((m) => m.sourceUrl === n);
  const ext = (rec?.extension ?? n.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const asset: Record<string, unknown> = {
    url: n,
    resourceType: rec?.mediaType === "video" ? "video" : "image",
    alt: cleanText(alt) || rec?.altText || "",
  };
  if (ext && ext.length <= 5) asset.format = ext === "jpeg" ? "jpg" : ext;
  if (rec?.width) asset.width = rec.width;
  if (rec?.height) asset.height = rec.height;
  return asset;
}

/** Deduplicates images by their WordPress original, keeping the largest rendition actually seen on the page. */
export function pickImages(refs: (ImageRef | string)[]): { url: string; alt: string | null }[] {
  const best = new Map<string, { url: string; alt: string | null; area: number }>();
  for (const ref of refs) {
    const r = typeof ref === "string" ? { url: ref, alternates: [] as string[], alt: null, width: null, height: null } : ref;
    for (const url of [r.url, ...(r.alternates ?? [])]) {
      if (!url || /\/wp-content\/(plugins|themes)\//.test(url) || /placeholder/i.test(url)) continue;
      const v = wpOriginalUrl(url);
      const area = v.isSizeVariant ? (v.width ?? 0) * (v.height ?? 0) : Number.MAX_SAFE_INTEGER;
      const prev = best.get(v.originalUrl);
      if (!prev || area > prev.area) best.set(v.originalUrl, { url, alt: r.alt ?? prev?.alt ?? null, area });
      else if (!prev.alt && r.alt) prev.alt = r.alt;
    }
  }
  return [...best.values()].map(({ url, alt }) => ({ url, alt }));
}

/** First paragraph(s) up to `max` chars, cut at a sentence boundary when possible. */
export function summarize(paragraphs: string[], max = 400): string | null {
  const text = cleanText(paragraphs.find((p) => p.length > 40) ?? paragraphs[0] ?? "");
  if (!text) return null;
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return cleanText(out) || truncate(text, max);
}

function robotsDirective(raw: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  return `${r.includes("noindex") ? "noindex" : "index"},${r.includes("nofollow") ? "nofollow" : "follow"}`;
}

/** Embedded `seo` object of the CMS + the old values that have no CMS field. */
function seoFor(ctx: NormalizeContext, page: RawPage): { seo: Record<string, unknown>; unmapped: Record<string, unknown>; suspicious: Suspicious[] } {
  const s = page.generic?.seo;
  const suspicious: Suspicious[] = [];
  if (!s) return { seo: {}, unmapped: {}, suspicious };
  const seo: Record<string, unknown> = {};
  if (s.title) seo.seoTitle = s.title.slice(0, 160);
  if (s.metaDescription) seo.metaDescription = s.metaDescription.slice(0, 320);
  if (s.metaKeywords) seo.keywords = s.metaKeywords.split(",").map((k) => k.trim()).filter(Boolean);
  if (s.og.title) seo.ogTitle = s.og.title;
  if (s.og.description) seo.ogDescription = s.og.description;
  const ogImage = mediaAsset(ctx, s.og.image, s.og["image:alt"]);
  if (ogImage) seo.ogImage = ogImage;
  const robots = robotsDirective(s.robots);
  if (robots) seo.robots = robots;
  if (s.title && s.title.length > 160) suspicious.push({ field: "seo.seoTitle", reason: `longer than 160 chars (${s.title.length}) – truncated` });
  if (s.metaDescription && /\b\w{1,3}$/.test(s.metaDescription) && !/[.!?]$/.test(s.metaDescription) && s.metaDescription.length >= 150) {
    suspicious.push({ field: "seo.metaDescription", reason: "appears cut off mid-sentence (auto-generated by the old SEO plugin)" });
  }
  return {
    seo,
    unmapped: {
      oldCanonicalUrl: s.canonical,
      robotsRaw: s.robots,
      twitter: s.twitter,
      openGraph: s.og,
      structuredDataTypes: s.structuredDataTypes,
    },
    suspicious,
  };
}

/** Old listing pages that represent a tour category (all other listings are archives / aliases). */
export const TOUR_LISTING_SUBTYPES = new Set(["round-tours", "one-day-tours", "per-day-basis", "offers"]);

/** Proposed path on the NEW site for an old URL (input for 301 redirects later – nothing is changed now). */
export function proposedNewPath(page: Pick<RawPage, "sourceUrl" | "classification">): string | null {
  const slug = slugFromUrl(page.sourceUrl);
  const c = page.classification;
  if (c.excludeFromImport) return null;
  switch (c.category) {
    case "homepage":
      return "/";
    case "tour-detail":
      return `/tours/${slug}`;
    case "tours":
      return c.subtype && TOUR_LISTING_SUBTYPES.has(c.subtype) ? `/tours?category=${cmsSlugify(c.subtype)}` : "/tours";
    case "destination":
      return c.isListing ? "/destinations" : `/destinations/${slug}`;
    case "excursion":
      return c.isListing ? "/excursions" : `/excursions/${slug}`;
    case "vehicle":
      return "/vehicles";
    case "faq":
      return "/faqs";
    case "gallery":
      return "/gallery";
    case "contact":
      return "/contact";
    case "reviews":
      return "/reviews";
    case "blog":
      return c.isListing ? "/blog" : `/blog/${slug}`;
    case "about":
    case "page":
      return slug === "tailor-made-tours" ? "/tailor-made-tours" : `/${slug}`;
    default:
      return null;
  }
}

/** Rewrites an old internal link to its proposed new path (external links are returned unchanged). */
function newLinkFor(url: string | null, pagesByUrl: Map<string, RawPage>): string {
  if (!url) return "";
  if (!isInternalUrl(url)) return url;
  const page = pagesByUrl.get(url);
  return (page && proposedNewPath(page)) ?? toSitePath(url);
}

function contentLinkNotes(markdown: string): string[] {
  const old = markdown.match(/\]\(https:\/\/srilankatoursdriver\.com\/[^)]*\)/g) ?? [];
  return old.length ? [`${old.length} link(s) in the text still point to the old site – rewrite with the URL map at import time`] : [];
}

/* ───────────── Tours ───────────── */

function itineraryDay(step: ItineraryStep): Record<string, unknown> {
  const firstLine = cleanText(step.paragraphs[0] ?? step.text.split(/(?<=[.!?])\s/)[0] ?? "");
  const title = firstLine ? truncate(firstLine.replace(/[,/]\s*$/, ""), 120) : step.title;
  const day: Record<string, unknown> = {
    day: step.dayNumber,
    title,
    description: step.markdown,
    activities: step.listItems,
    meals: [],
  };
  if (step.overnight) {
    day.overnight = step.overnight;
    day.location = step.overnight;
  }
  return day;
}

export function normalizeTour(ctx: NormalizeContext, page: RawPage): NormalizedRecord {
  const b = page.booking!;
  const slug = slugFromUrl(page.sourceUrl);
  const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
  const g = page.generic;
  // /offers/ pages use a plain post template (no booking widgets) – fall back to the generic page content.
  const bookingTemplate = Boolean(b.contentMarkdown || b.priceFrom || b.steps.length || b.included.length);
  const title = b.title ?? g?.title ?? null;
  const description = bookingTemplate ? b.contentMarkdown : (g?.contentMarkdown ?? "").replace(/^#{1,6} .*\n+/, "");
  const paragraphs = bookingTemplate ? b.contentParagraphs : (g?.paragraphs ?? []);
  const images = pickImages(bookingTemplate ? b.galleryImages : (g?.images ?? []));
  const hero = g?.seo.og.image ?? images[0]?.url ?? null;
  const titleDuration = parseDuration(title);
  const durationDays = b.duration?.days ?? titleDuration?.days ?? null;
  const steps = [...b.steps].sort((x, y) => (x.dayNumber ?? 0) - (y.dayNumber ?? 0));
  const notes: string[] = [];
  if (!bookingTemplate) notes.push("page does not use the booking template – description/images taken from the generic page content");
  if (!b.duration?.days && titleDuration?.days) notes.push("durationDays taken from the title (duration widget empty)");
  const priceLines = b.contentParagraphs.filter((p) => /(\$|usd|lkr|€|£)\s*\d|\d\s*(usd|lkr)/i.test(p) && !p.includes(String(b.priceFrom?.raw ?? "\u0000")));
  const driverIncluded = b.included.some((i) => /driver/i.test(i));
  const languages = [...new Set(b.included.flatMap((i) => [...i.matchAll(/(\w+) speaking/gi)].map((m) => m[1])))];

  const data: Record<string, unknown> = {
    title,
    slug,
    shortDescription: summarize(paragraphs, 400),
    description,
    heroMedia: mediaAsset(ctx, hero, title),
    gallery: images.map((i) => mediaAsset(ctx, i.url, i.alt)).filter(Boolean),
    durationDays,
    ...(b.duration?.nights !== null && b.duration?.nights !== undefined ? { durationNights: b.duration.nights } : {}),
    price: b.priceFrom?.amount ?? null,
    currency: b.priceFrom?.currency ?? null,
    priceNote: [b.priceFrom?.label ? `${b.priceFrom.label} ${b.priceFrom.raw}` : null, ...priceLines].filter(Boolean).join(" · ").replace(/^\*\s*/, "") || "",
    ...(b.tourType ? { tourType: b.tourType } : {}),
    ...(b.maxGuests ? { groupSize: `Max ${b.maxGuests} people` } : {}),
    included: b.included,
    excluded: b.excluded,
    ...(driverIncluded || languages.length ? { driver: { included: driverIncluded, languages } } : {}),
    itinerary: steps.map(itineraryDay),
    seo,
    status: "draft",
  };
  if (b.priceFrom && b.priceFrom.currency === null) suspicious.push({ field: "currency", reason: "price has no recognisable currency symbol" });
  if (b.priceFrom && (b.priceFrom.amount <= 0 || b.priceFrom.amount > 50_000)) suspicious.push({ field: "price", reason: `unusual amount ${b.priceFrom.amount}` });
  const slugDays = /^0*(\d+)-days?/.exec(slug ?? "")?.[1];
  if (slugDays && durationDays && Number(slugDays) !== durationDays) suspicious.push({ field: "durationDays", reason: `slug says ${slugDays} days, page says ${durationDays}` });
  if (durationDays && durationDays > 1 && steps.length && steps.length !== durationDays) suspicious.push({ field: "itinerary", reason: `${steps.length} itinerary days for a ${durationDays}-day tour` });
  steps.forEach((s, i) => {
    if (s.dayNumber !== i + 1) suspicious.push({ field: `itinerary.${i}.day`, reason: `day numbers not sequential (found Day ${s.dayNumber} at position ${i + 1})` });
  });
  if (/with hotels?/i.test(b.title ?? "")) notes.push("'with hotels' variant – hotel names are not listed on the old page (Tour.hotels left empty)");
  notes.push(...contentLinkNotes(description));
  if (page.classification.subtype === "offer") notes.push("offer page (/offers/) – thin promotional page, not a full tour");

  const quality = buildQuality(
    {
      title: data.title,
      slug: data.slug,
      description: data.description,
      price: data.price,
      currency: data.currency,
      durationDays: data.durationDays,
      heroMedia: data.heroMedia,
      included: data.included,
      itinerary: durationDays && durationDays > 1 ? data.itinerary : ["n/a for day tours"],
      "seo.metaDescription": seo.metaDescription,
    },
    { suspicious, notes, parsingErrors: page.parsingErrors },
  );
  return {
    sourceUrl: page.sourceUrl,
    sourceType: page.classification.subtype === "offer" ? "tour-offer" : "tour",
    sourceWpId: page.wpPostId,
    targetModel: "Tour",
    data,
    references: {
      categoryHints: [...(ctx.listingMembership.get(page.sourceUrl) ?? [])].sort(),
      destinationHints: b.destinationsMentioned,
      vehicleHints: b.contentParagraphs.filter((p) => /persons?\s*-?>|->/i.test(p)),
      featuredOnHomepage: [...(ctx.homepageFeatures.get(page.sourceUrl) ?? [])],
    },
    unmapped: {
      minAge: b.minAge,
      maxGuests: b.maxGuests,
      ratingSummary: b.ratingSummary,
      bookingForm: b.bookingForm,
      otherSteps: b.otherSteps.map((s) => ({ title: s.title, text: s.text })),
      contactInContent: { emails: b.emails, phones: b.phones },
      facts: b.facts,
      seo: seoUnmapped,
      mapLinks: itemMapLinks(page),
      proposedNewPath: proposedNewPath(page),
    },
    quality,
    ...recommend(page, quality),
  };
}

/* ───────────── Vehicles (driver + vehicle listings under /to_book/) ───────────── */

export function normalizeVehicle(ctx: NormalizeContext, page: RawPage): NormalizedRecord {
  const b = page.booking!;
  const slug = slugFromUrl(page.sourceUrl);
  const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
  const [driverName, vehicleType] = (b.title ?? "").split(/\s+[–-]\s+/, 2).map((s) => cleanText(s));
  const images = pickImages(b.galleryImages);
  const hero = page.generic?.seo.og.image;
  const allImages = pickImages([...(hero ? [hero] : []), ...b.galleryImages]);
  const languages = b.facts["Language(s)"] ?? b.facts.Languages ?? b.facts.Language ?? null;
  const experience = b.facts["Years of Experience"] ?? null;
  const airCon = b.included.some((i) => /air[- ]?condition/i.test(i));
  const data: Record<string, unknown> = {
    name: b.title,
    slug,
    type: vehicleType || null,
    description: b.contentMarkdown,
    images: allImages.map((i) => mediaAsset(ctx, i.url, i.alt ?? b.title)).filter(Boolean),
    seats: b.maxGuests,
    ...(airCon ? { airConditioning: true } : {}),
    features: b.included,
    dailyRate: b.priceFrom?.amount ?? null,
    currency: b.priceFrom?.currency ?? null,
    seo,
    status: "draft",
  };
  suspicious.push({ field: "dailyRate", reason: "old site shows this as 'Price From' – confirm it is a per-day rate before importing" });
  if (b.maxGuests && b.maxGuests > 60) suspicious.push({ field: "seats", reason: `unusually high (${b.maxGuests})` });
  const notes = [
    "Driver details (name, experience, languages) have no field on the Vehicle model – kept in `unmapped.driver`",
    ...contentLinkNotes(b.contentMarkdown),
  ];
  if (!images.length && hero) notes.push("no gallery on the page – image taken from og:image");
  const quality = buildQuality(
    { name: data.name, slug: data.slug, type: data.type, description: data.description, images: data.images, seats: data.seats, dailyRate: data.dailyRate },
    { suspicious, notes, parsingErrors: page.parsingErrors },
  );
  return {
    sourceUrl: page.sourceUrl,
    sourceType: "vehicle",
    sourceWpId: page.wpPostId,
    targetModel: "Vehicle",
    data,
    references: { categoryHints: vehicleType ? [vehicleType] : [], featuredOnHomepage: [...(ctx.homepageFeatures.get(page.sourceUrl) ?? [])] },
    unmapped: {
      driver: { name: driverName || null, experience, languages: languages ? languages.split(/\s*[,/&]\s*|\s+and\s+/).filter(Boolean) : [], vehicleModel: b.facts["Type of Vehicle"] ?? null },
      excluded: b.excluded,
      minAge: b.minAge,
      otherSteps: b.otherSteps.map((s) => ({ title: s.title, text: s.text })),
      facts: b.facts,
      seo: seoUnmapped,
      mapLinks: itemMapLinks(page),
      proposedNewPath: proposedNewPath(page),
    },
    quality,
    ...recommend(page, quality),
  };
}

/* ───────────── Destinations ───────────── */

export function normalizeDestination(ctx: NormalizeContext, page: RawPage): NormalizedRecord {
  const d = page.destination!;
  const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
  const images = pickImages(d.images);
  const data: Record<string, unknown> = {
    name: d.name,
    slug: slugFromUrl(page.sourceUrl),
    shortDescription: summarize(d.paragraphs, 400),
    description: d.markdown,
    heroMedia: images[0] ? mediaAsset(ctx, images[0].url, images[0].alt) : null,
    gallery: images.slice(1).map((i) => mediaAsset(ctx, i.url, i.alt)).filter(Boolean),
    seo,
    status: "draft",
  };
  const quality = buildQuality(
    { name: data.name, slug: data.slug, description: data.description, heroMedia: data.heroMedia, region: null, "seo.metaDescription": seo.metaDescription },
    { suspicious, notes: ["region / map location / best time to visit are not on the old page", ...contentLinkNotes(d.markdown)], parsingErrors: page.parsingErrors },
  );
  return {
    sourceUrl: page.sourceUrl,
    sourceType: "destination",
    sourceWpId: page.wpPostId,
    targetModel: "Destination",
    data,
    references: {},
    unmapped: { attractions: d.attractions, mapLinks: itemMapLinks(page), seo: seoUnmapped, proposedNewPath: proposedNewPath(page) },
    quality,
    ...recommend(page, quality),
  };
}

/* ───────────── Excursions (old site: per-city transfer rate tables) ───────────── */

export function normalizeExcursion(ctx: NormalizeContext, page: RawPage): NormalizedRecord {
  const e = page.excursion!;
  const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
  const origin = e.rates.find((r) => r.from)?.from ?? e.title;
  const table = e.rates.length
    ? [
        `| ${e.rateTableHeaders.join(" | ")} |`,
        `| ${e.rateTableHeaders.map(() => "---").join(" | ")} |`,
        ...e.rates.map((r) => `| ${r.cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`),
      ].join("\n")
    : "";
  const intro = e.descriptionParagraphs.filter((p) => !/^from\s+\w+$/i.test(p));
  const description = [intro.join("\n\n"), table ? `## Transfer rates from ${origin}\n\n${table}` : ""].filter(Boolean).join("\n\n");
  const images = pickImages(e.images);
  const data: Record<string, unknown> = {
    title: e.title,
    slug: slugFromUrl(page.sourceUrl),
    location: origin,
    shortDescription: intro.length ? summarize(intro, 400) : null,
    description,
    heroMedia: images[0] ? mediaAsset(ctx, images[0].url, images[0].alt ?? e.title) : null,
    gallery: images.slice(1).map((i) => mediaAsset(ctx, i.url, i.alt)).filter(Boolean),
    seo,
    status: "draft",
  };
  suspicious.push({
    field: "price",
    reason: `old excursion pages are transfer-rate tables (${e.rates.length} routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates`,
  });
  const quality = buildQuality(
    { title: data.title, slug: data.slug, location: data.location, description: data.description, heroMedia: data.heroMedia, shortDescription: data.shortDescription, price: null, duration: null },
    { suspicious, notes: ["Consider whether these belong in Excursions or in a transfers page – decision needed before import"], parsingErrors: page.parsingErrors },
  );
  return {
    sourceUrl: page.sourceUrl,
    sourceType: "excursion-transfer-rates",
    sourceWpId: page.wpPostId,
    targetModel: "Excursion",
    data,
    references: { destinationHints: [origin].filter(Boolean) },
    unmapped: {
      transferRates: e.rates.map(({ cells: _cells, ...r }) => r),
      rateTableHeaders: e.rateTableHeaders,
      transferForm: { present: e.transferFormPresent, title: e.transferFormTitle },
      seo: seoUnmapped,
      mapLinks: itemMapLinks(page),
      proposedNewPath: proposedNewPath(page),
    },
    quality,
    ...recommend(page, quality, ["schema mismatch: transfer rates vs single-price excursion"]),
  };
}

/* ───────────── FAQs ───────────── */

export function normalizeFaqs(pages: RawPage[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  const seen = new Map<string, string>();
  for (const page of pages) {
    const groups = new Set((page.faqs ?? []).map((f) => f.group));
    (page.faqs ?? []).forEach((f, i) => {
      const key = comparableText(f.question);
      const suspicious: Suspicious[] = [];
      if (f.question === f.question.toUpperCase() && /[A-Z]{4}/.test(f.question)) suspicious.push({ field: "question", reason: "written in ALL CAPS on the old site" });
      if (f.question.length > 300) suspicious.push({ field: "question", reason: "longer than the 300-char limit" });
      const quality = buildQuality({ question: f.question, answer: f.answerMarkdown }, { suspicious, parsingErrors: page.parsingErrors });
      const dup = seen.get(key);
      if (dup) quality.duplicateOf.push(dup);
      else seen.set(key, `${page.sourceUrl}#faq-${i + 1}`);
      out.push({
        sourceUrl: `${page.sourceUrl}#faq-${i + 1}`,
        sourceType: "faq",
        sourceWpId: page.wpPostId,
        targetModel: "FAQ",
        data: { question: f.question, answer: f.answerMarkdown, category: groups.size > 1 && f.group ? f.group : "General", status: "draft", order: i + 1 },
        references: {},
        unmapped: { sourceGroupHeading: f.group, answerText: f.answerText, widget: f.widget },
        quality,
        ...(dup ? { recommendation: "skip" as const, recommendationReason: `duplicate of ${dup}` } : recommend(page, quality)),
      });
    });
  }
  return out;
}

/* ───────────── Reviews ───────────── */

export function normalizeReviews(pages: RawPage[]): NormalizedRecord[] {
  const out = new Map<string, NormalizedRecord>();
  for (const page of pages) {
    for (const r of page.reviews ?? []) {
      const key = comparableText(`${r.guestName}|${r.date ?? r.dateRaw}|${r.title}|${r.text.slice(0, 120)}`);
      const existing = out.get(key);
      if (existing) {
        const pagesSeen = existing.unmapped.seenOnPages as string[];
        if (!pagesSeen.includes(page.sourceUrl)) pagesSeen.push(page.sourceUrl);
        continue;
      }
      const suspicious: Suspicious[] = [];
      if (r.date && r.date > new Date().toISOString().slice(0, 10)) suspicious.push({ field: "date", reason: "date is in the future" });
      if (/…|\.\.\.$/.test(r.text)) suspicious.push({ field: "review", reason: "text may be truncated by the slider" });
      const quality = buildQuality({ guestName: r.guestName, rating: r.rating, review: r.text, date: r.date }, { suspicious, notes: ["genuine TripAdvisor review shown on the old site – verify against TripAdvisor before publishing"] });
      out.set(key, {
        sourceUrl: page.sourceUrl,
        sourceType: "review",
        sourceWpId: null,
        targetModel: "Review",
        data: {
          guestName: r.guestName,
          rating: r.rating,
          title: r.title ?? "",
          review: r.text,
          date: r.date,
          platform: r.platform,
          sourceUrl: r.profileUrl ?? "",
          verified: r.verified,
          status: "pending",
          ...(r.avatarUrl && !/default-avatar/i.test(r.avatarUrl) ? { photo: { url: r.avatarUrl, resourceType: "image", alt: r.guestName ?? "" } } : {}),
        },
        references: {},
        unmapped: { dateRaw: r.dateRaw, widgetId: r.widgetId, seenOnPages: [page.sourceUrl] },
        quality,
        ...recommend(null, quality),
      });
    }
  }
  return [...out.values()];
}

/* ───────────── Gallery (Instagram feed + on-site galleries) ───────────── */

export function normalizeGallery(ctx: NormalizeContext, pages: RawPage[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    (page.instagram ?? []).forEach((item, i) => {
      const key = item.permalink ?? item.mediaUrl ?? `${page.sourceUrl}#${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      const hashtags = [...new Set((item.caption ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? [])];
      const firstLine = cleanText((item.caption ?? "").split(/\n|(?<=[.!?])\s/)[0] ?? "");
      const quality = buildQuality(
        { media: item.mediaUrl, caption: item.caption },
        {
          suspicious: [{ field: "media.url", reason: "Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time" }],
          notes: item.type === "video" ? ["Instagram video – could be a Guest Short only if it really shows guests (do not assume)"] : [],
        },
      );
      out.push({
        sourceUrl: item.permalink ?? page.sourceUrl,
        sourceType: `instagram-${item.type}`,
        sourceWpId: null,
        targetModel: "GalleryItem",
        data: {
          media: item.mediaUrl ? { url: item.mediaUrl, resourceType: item.type === "video" ? "video" : "image", alt: "" } : null,
          title: truncate(firstLine, 120),
          caption: item.caption ?? "",
          altText: "",
          tags: hashtags.map((h) => h.slice(1).toLowerCase()).slice(0, 20),
          status: "draft",
        },
        references: {},
        unmapped: { permalink: item.permalink, postedAt: item.postedAt, foundOn: page.sourceUrl },
        quality,
        recommendation: "review",
        recommendationReason: "Instagram-hosted media – needs re-download and an alt text before import",
      });
    });
    for (const img of pickImages(page.galleryImages ?? [])) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      const quality = buildQuality({ media: img.url, altText: img.alt });
      out.push({
        sourceUrl: page.sourceUrl,
        sourceType: "gallery-image",
        sourceWpId: null,
        targetModel: "GalleryItem",
        data: { media: mediaAsset(ctx, img.url, img.alt), title: "", caption: "", altText: img.alt ?? "", tags: [], status: "draft" },
        references: {},
        unmapped: {},
        quality,
        ...recommend(page, quality),
      });
    }
  }
  return out;
}

/* ───────────── Pages + sections ───────────── */

const SYSTEM_PAGE_FOR: Partial<Record<string, string>> = {
  homepage: "home",
  faq: "faqs",
  gallery: "gallery",
  contact: "contact",
  reviews: "reviews",
};

/** CMS page slug an old page maps to (system pages have fixed slugs in the new CMS). */
export function targetPageSlug(page: RawPage): { slug: string | null; isSystem: boolean } {
  const c = page.classification;
  const old = slugFromUrl(page.sourceUrl);
  if (SYSTEM_PAGE_FOR[c.category]) return { slug: SYSTEM_PAGE_FOR[c.category]!, isSystem: true };
  if (c.category === "tours" && old === "tours") return { slug: "tours", isSystem: true };
  if (c.category === "destination" && c.isListing) return { slug: "destinations", isSystem: true };
  if (c.category === "excursion" && c.isListing) return { slug: "excursions", isSystem: true };
  if (c.category === "vehicle" && c.isListing) return { slug: "vehicles", isSystem: true };
  if (c.category === "blog" && c.isListing) return { slug: "blog", isSystem: true };
  if (old === "tailor-made-tours") return { slug: "tailor-made-tours", isSystem: true };
  if (c.category === "about" || c.category === "page") return { slug: old, isSystem: false };
  return { slug: null, isSystem: false };
}

export function normalizePages(ctx: NormalizeContext, pages: RawPage[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const page of pages) {
    const { slug, isSystem } = targetPageSlug(page);
    if (!slug && !page.classification.excludeFromImport) continue;
    const g = page.generic;
    const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
    const listing = page.classification.isListing || page.classification.category === "homepage";
    const heading = g?.headings.find((h) => h.level <= 2)?.text ?? null;
    const title = g?.h1[0] ?? g?.pageTitle ?? heading;
    const firstImage = pickImages(g?.images ?? [])[0];
    const content = listing ? "" : (g?.contentMarkdown ?? "");
    const data: Record<string, unknown> = {
      slug: slug ?? slugFromUrl(page.sourceUrl),
      title,
      subtitle: listing ? (g?.paragraphs.find((p) => p.length > 20 && p.length < 300) ?? "") : "",
      ...(firstImage && !listing ? { heroImage: mediaAsset(ctx, firstImage.url, firstImage.alt) } : {}),
      content,
      isSystem,
      status: "draft",
      seo,
    };
    const oldSlug = slugFromUrl(page.sourceUrl);
    const notes: string[] = [];
    if (oldSlug && slug && oldSlug !== slug) notes.push(`old slug "${oldSlug}" maps onto the CMS ${isSystem ? "system " : ""}page "${slug}"`);
    if (listing) notes.push("listing page – only title/subtitle/SEO are migrated; the item cards come from the CMS collections");
    if (/contact@example\.com/i.test(page.extractedText) || g?.links.special.some((l) => /example\.com/i.test(l.href))) {
      suspicious.push({ field: "content", reason: "page contains a placeholder e-mail (contact@example.com)" });
    }
    notes.push(...contentLinkNotes(content));
    const quality = buildQuality({ slug: data.slug, title: data.title, ...(listing ? {} : { content: data.content }), "seo.metaDescription": seo.metaDescription }, { suspicious, notes, parsingErrors: page.parsingErrors });
    out.push({
      sourceUrl: page.sourceUrl,
      sourceType: page.classification.isListing ? `${page.classification.category}-listing` : page.classification.category,
      sourceWpId: page.wpPostId,
      targetModel: "Page",
      data,
      references: {},
      unmapped: { oldSlug, headings: g?.headings ?? [], seo: seoUnmapped, proposedNewPath: proposedNewPath(page), wpPostType: page.wpPostType },
      quality,
      ...recommend(page, quality),
    });
  }
  return out;
}

export function normalizePageSections(ctx: NormalizeContext, pages: RawPage[], pagesByUrl: Map<string, RawPage>): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const page of pages) {
    const { slug } = targetPageSlug(page);
    if (!slug || page.classification.excludeFromImport) continue;
    (page.sections ?? []).forEach((s, i) => {
      const img = pickImages(s.images)[0];
      const data: Record<string, unknown> = {
        type: s.typeGuess,
        name: s.headings[0] ?? `${s.typeGuess} ${i + 1}`,
        title: s.headings[0] ?? "",
        subtitle: s.headings[1] && s.items.every((it) => it.title !== s.headings[1]) ? s.headings[1] : "",
        content: s.paragraphs.join("\n\n"),
        items: s.items.map((it) => ({ title: it.title, description: it.description, icon: "", url: newLinkFor(it.url, pagesByUrl) })),
        buttons: s.buttons.map((b) => ({ label: b.label, url: newLinkFor(b.url, pagesByUrl), variant: "primary" })),
        ...(img ? { media: mediaAsset(ctx, img.url, img.alt) } : {}),
        enabled: true,
        order: i + 1,
      };
      const quality = buildQuality(
        { type: data.type, title: data.title },
        { notes: [`type guessed from: ${s.evidence.join(", ") || "default"} (confidence ${s.confidence})`, ...(s.items.some((it) => it.icon) ? ["old Font Awesome icon classes kept in unmapped.icons"] : [])] },
      );
      out.push({
        sourceUrl: `${page.sourceUrl}#section-${i + 1}`,
        sourceType: "page-section",
        sourceWpId: page.wpPostId,
        targetModel: "PageSection",
        data,
        references: { page: slug, linkedItems: s.linkedItems.map((u) => newLinkFor(u, pagesByUrl)) },
        unmapped: { elementorWidgets: s.widgets, icons: s.items.map((it) => it.icon), confidence: s.confidence, imageCount: s.images.length },
        quality,
        recommendation: "review",
        recommendationReason: `section type is a guess (${s.confidence} confidence) – compare with the seeded CMS sections before importing`,
      });
    });
  }
  return out;
}

/* ───────────── Categories (from the old tour listing pages) ───────────── */

export function normalizeCategories(pages: RawPage[], nav: NavNode[]): NormalizedRecord[] {
  const navLabels = new Map<string, string>();
  const walk = (nodes: NavNode[]) =>
    nodes.forEach((n) => {
      if (n.url) navLabels.set(n.url, n.label);
      walk(n.children);
    });
  walk(nav);
  const vehicleUrls = new Set(pages.filter((p) => p.classification.category === "vehicle").map((p) => p.sourceUrl));
  const out: NormalizedRecord[] = [];
  for (const page of pages) {
    const c = page.classification;
    if (c.category !== "tours" || !c.isListing || !TOUR_LISTING_SUBTYPES.has(c.subtype ?? "") || c.excludeFromImport) continue;
    const name = navLabels.get(page.sourceUrl) ?? page.generic?.h1[0] ?? page.generic?.pageTitle ?? String(c.subtype);
    const members = (page.generic?.contentLinks ?? []).filter((u) => /\/(to_book|offers)\/[^/]+\/$/.test(u));
    const suspicious: Suspicious[] = [];
    if (members.length && members.every((u) => vehicleUrls.has(u))) {
      suspicious.push({ field: "kind", reason: "every item on this old listing is a driver/vehicle page – map to the Vehicles page instead of a tour category?" });
    }
    const quality = buildQuality({ name, members }, { suspicious, notes: [`name from ${navLabels.has(page.sourceUrl) ? "header menu label" : "page heading"}`] });
    out.push({
      sourceUrl: page.sourceUrl,
      sourceType: "tour-listing",
      sourceWpId: page.wpPostId,
      targetModel: "Category",
      data: { kind: "tour", name, slug: cmsSlugify(name), description: summarize(page.generic?.paragraphs ?? [], 300) ?? "", enabled: true },
      references: { memberUrls: [...new Set(members)].sort() },
      unmapped: { proposedNewPath: proposedNewPath(page) },
      quality,
      ...recommend(page, quality),
    });
  }
  return out;
}

/* ───────────── Site settings / brand / navigation / SEO ───────────── */

function rank<T>(items: Sourced<T>[], filter: (v: T) => boolean = () => true): { value: T | null; variants: Sourced<T>[] } {
  const counts = new Map<string, { item: Sourced<T>; n: number }>();
  for (const it of items.filter((i) => filter(i.value))) {
    const k = JSON.stringify(it.value);
    const e = counts.get(k);
    if (e) e.n += 1;
    else counts.set(k, { item: it, n: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n || JSON.stringify(b.item.value).length - JSON.stringify(a.item.value).length);
  return { value: sorted[0]?.item.value ?? null, variants: items };
}

export function mergeBusiness(pages: RawPage[]): BusinessExtraction {
  const merged: BusinessExtraction = { siteName: [], addresses: [], phones: [], whatsapp: [], emails: [], businessHours: [], socials: [], maps: [], iconBoxes: [] };
  const itemPage = (p: RawPage) => ["tour-detail", "vehicle", "destination", "excursion"].includes(p.classification.category) && !p.classification.isListing;
  for (const p of pages) {
    if (!p.business || p.classification.excludeFromImport) continue;
    for (const k of Object.keys(merged) as (keyof BusinessExtraction)[]) {
      // "View on Map" links on tour/destination/excursion pages locate the ITEM, not the business.
      const values = k === "maps" && itemPage(p) ? [] : (p.business[k] as unknown[]);
      (merged[k] as unknown[]).push(...values);
    }
  }
  const seenBoxes = new Set<string>();
  merged.iconBoxes = merged.iconBoxes.filter((b) => {
    const key = `${b.title.replace(/:$/, "")}|${b.text}`;
    if (seenBoxes.has(key)) return false;
    seenBoxes.add(key);
    return true;
  });
  return merged;
}

/** Map links found on an item page (location of the tour stop / destination / excursion). */
export function itemMapLinks(page: RawPage): { url: string; label: string }[] {
  return (page.business?.maps ?? []).filter((m) => m.value.kind === "link").map((m) => ({ url: m.value.url, label: m.evidence.replace(/^map link "|"$/g, "") }));
}

export function normalizeSiteSettings(ctx: NormalizeContext, pages: RawPage[], pagesByUrl: Map<string, RawPage>): { record: NormalizedRecord; evidence: Record<string, unknown> } {
  const biz = mergeBusiness(pages);
  const home = pages.find((p) => p.classification.category === "homepage");
  const footer = home?.footer;
  const placeholderEmail = (e: string) => !/example\.(com|org|net)$/i.test(e);
  const site = rank(biz.siteName);
  const address = rank(biz.addresses);
  const phone = rank(biz.phones);
  const whatsapp = rank(biz.whatsapp);
  const email = rank(biz.emails, placeholderEmail);
  const hours = rank(biz.businessHours);
  const social: Record<string, string> = {};
  for (const s of biz.socials) social[s.value.platform] ??= s.value.url;
  const mapLink = biz.maps.find((m) => m.value.kind === "link");
  const suspicious: Suspicious[] = [];
  const distinct = <T>(l: Sourced<T>[]) => new Set(l.map((x) => JSON.stringify(x.value))).size;
  for (const [field, list] of [
    ["address", biz.addresses],
    ["phone", biz.phones],
    ["whatsapp", biz.whatsapp],
    ["email", biz.emails.filter((e) => placeholderEmail(e.value))],
  ] as const) {
    if (distinct(list as Sourced<unknown>[]) > 1) suspicious.push({ field, reason: `${distinct(list as Sourced<unknown>[])} different values on the old site – pick one manually (see business-data report)` });
  }
  if (biz.emails.some((e) => !placeholderEmail(e.value))) suspicious.push({ field: "email", reason: "a placeholder address (example.com) appears on the old site – ignored" });
  const distinctMaps = new Set(biz.maps.map((m) => m.value.url)).size;
  if (distinctMaps > 1) suspicious.push({ field: "googleMapsUrl", reason: `${distinctMaps} different business map links/embeds on the old site – confirm which one is current` });
  if (ctx.wp.siteName && site.value && ctx.wp.siteName !== site.value) suspicious.push({ field: "siteName", reason: `WordPress name "${ctx.wp.siteName}" differs from og:site_name "${site.value}"` });

  const data: Record<string, unknown> = {
    key: "default",
    siteName: site.value ?? ctx.wp.siteName,
    businessName: site.value ?? ctx.wp.siteName,
    tagline: ctx.wp.siteDescription ?? "",
    address: address.value ?? "",
    googleMapsUrl: mapLink?.value.url ?? "",
    phone: phone.value ?? "",
    whatsapp: whatsapp.value ?? "",
    email: email.value ?? "",
    businessHours: hours.value ?? "",
    websiteUrl: "https://srilankatoursdriver.com",
    social,
    footer: {
      description: footer?.texts.find((t) => t.length > 80) ?? "",
      columns: (footer?.columns ?? []).map((c) => ({ title: c.title, links: c.links.map((l) => ({ label: l.label, url: newLinkFor(l.url, pagesByUrl) })), enabled: true })),
      copyright: footer?.copyright ?? "",
    },
    tripadvisor: social.tripadvisor ? { enabled: true, profileUrl: social.tripadvisor } : { enabled: false },
  };
  const quality = buildQuality(
    { siteName: data.siteName, address: data.address, phone: data.phone, whatsapp: data.whatsapp, email: data.email, businessHours: data.businessHours, googleMapsUrl: data.googleMapsUrl },
    { suspicious, notes: ["mapEmbedUrl not migrated: the old embed carries a Google Maps API key (redacted in reports) – create a new embed URL", "footer links rewritten to proposed new paths"] },
  );
  return {
    record: {
      sourceUrl: home?.sourceUrl ?? "https://srilankatoursdriver.com/",
      sourceType: "business-data",
      sourceWpId: null,
      targetModel: "SiteSetting",
      data,
      references: {},
      unmapped: { wordpressName: ctx.wp.siteName, wordpressTagline: ctx.wp.siteDescription, mapEmbeds: biz.maps.filter((m) => m.value.kind === "embed").map((m) => m.value) },
      quality,
      recommendation: "review",
      recommendationReason: "business data must be verified manually before import",
    },
    evidence: { siteName: site.variants, address: address.variants, phone: phone.variants, whatsapp: whatsapp.variants, email: email.variants, businessHours: hours.variants, socials: biz.socials, maps: biz.maps, iconBoxes: biz.iconBoxes },
  };
}

export function normalizeBrand(ctx: NormalizeContext, home: RawPage | undefined): NormalizedRecord {
  const logos = ctx.media.list().filter((m) => m.roles.includes("logo"));
  const favicons = ctx.media.list().filter((m) => m.roles.includes("favicon"));
  const biggestFavicon = [...favicons].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const logo = logos[0];
  const data: Record<string, unknown> = {
    key: "default",
    ...(logo ? { primaryLogo: mediaAsset(ctx, logo.sourceUrl, logo.altText) } : {}),
    ...(biggestFavicon ? { favicon: mediaAsset(ctx, biggestFavicon.sourceUrl, "") } : {}),
    logoAlt: logo?.altText ?? "",
  };
  const quality = buildQuality({ primaryLogo: data.primaryLogo, favicon: data.favicon }, { notes: ["brand colours are defined in theme CSS – not extracted (keep the CMS defaults)"] });
  return {
    sourceUrl: home?.sourceUrl ?? "https://srilankatoursdriver.com/",
    sourceType: "brand",
    sourceWpId: null,
    targetModel: "BrandSetting",
    data,
    references: {},
    unmapped: { allLogoUrls: logos.map((l) => l.sourceUrl), allFaviconUrls: favicons.map((f) => f.sourceUrl) },
    quality,
    ...recommend(null, quality),
  };
}

export function normalizeNavigation(nav: NavNode[], home: RawPage | undefined, pagesByUrl: Map<string, RawPage>): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  const walk = (nodes: NavNode[], parent: string | null) =>
    nodes.forEach((n, i) => {
      const url = newLinkFor(n.url, pagesByUrl);
      const quality = buildQuality({ label: n.label, url });
      out.push({
        sourceUrl: home?.sourceUrl ?? "https://srilankatoursdriver.com/",
        sourceType: "header-menu-item",
        sourceWpId: null,
        targetModel: "NavigationItem",
        data: { label: n.label, url, location: "header", order: i + 1, enabled: true, openInNewTab: n.openInNewTab, isCta: false },
        references: { parentLabel: parent },
        unmapped: { oldUrl: n.url },
        quality,
        recommendation: "review",
        recommendationReason: "the CMS already has a seeded header menu – merge manually",
      });
      walk(n.children, n.label);
    });
  walk(nav, null);
  return out;
}

export function normalizeSeoMetadata(ctx: NormalizeContext, pages: RawPage[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  const routeKey = (p: RawPage): string | null => {
    if (p.classification.category === "homepage") return "global";
    const t = targetPageSlug(p);
    return t.isSystem && t.slug ? t.slug : null;
  };
  const seen = new Set<string>();
  for (const page of pages) {
    const key = routeKey(page);
    if (!key || seen.has(key) || page.classification.excludeFromImport) continue;
    seen.add(key);
    const s = page.generic?.seo;
    if (!s) continue;
    const og = mediaAsset(ctx, s.og.image);
    const titles = pages.map((p) => p.generic?.seo.title ?? "").filter(Boolean);
    const suffixShare = titles.filter((t) => / - Sri Lanka Tours Drivers$/.test(t)).length / Math.max(1, titles.length);
    const data: Record<string, unknown> = {
      key,
      seoTitle: s.title ?? "",
      metaDescription: s.metaDescription ?? "",
      ...(s.metaKeywords ? { keywords: s.metaKeywords.split(",").map((k) => k.trim()) } : {}),
      ogTitle: s.og.title ?? "",
      ogDescription: s.og.description ?? "",
      ...(og ? { ogImage: og } : {}),
      robots: robotsDirective(s.robots) ?? "index,follow",
      ...(key === "global" && s.verification["google-site-verification"] ? { googleSiteVerification: s.verification["google-site-verification"] } : {}),
      ...(key === "global" && s.twitter.site ? { twitterHandle: s.twitter.site } : {}),
    };
    const quality = buildQuality({ seoTitle: data.seoTitle, metaDescription: data.metaDescription }, { notes: key === "global" ? [`${Math.round(suffixShare * 100)}% of old titles use the pattern "%s - Sri Lanka Tours Drivers"`] : [] });
    out.push({
      sourceUrl: page.sourceUrl,
      sourceType: "route-seo",
      sourceWpId: page.wpPostId,
      targetModel: "SeoMetadata",
      data,
      references: {},
      unmapped: { canonical: s.canonical, robotsRaw: s.robots, twitter: s.twitter, structuredDataTypes: s.structuredDataTypes, htmlLang: s.htmlLang },
      quality,
      recommendation: "review",
      recommendationReason: "the new site's SEO configuration must not be changed yet – reference only",
    });
  }
  return out;
}

/* ───────────── Blog ───────────── */

export function normalizeBlog(ctx: NormalizeContext, pages: RawPage[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const page of pages.filter((p) => p.classification.category === "blog" && !p.classification.isListing)) {
    const wp = ctx.wp.posts.find((p) => normalizeUrl(p.link) === page.sourceUrl || p.id === page.wpPostId);
    const g = page.generic;
    const { seo, unmapped: seoUnmapped, suspicious } = seoFor(ctx, page);
    const data: Record<string, unknown> = {
      title: g?.h1[0] ?? g?.pageTitle,
      slug: slugFromUrl(page.sourceUrl),
      excerpt: summarize(g?.paragraphs ?? [], 500) ?? "",
      content: g?.contentMarkdown ?? "",
      publishDate: wp?.date ?? g?.seo.article.published_time ?? null,
      status: "draft",
      seo,
    };
    const quality = buildQuality({ title: data.title, slug: data.slug, content: data.content, publishDate: data.publishDate }, { suspicious, parsingErrors: page.parsingErrors });
    out.push({
      sourceUrl: page.sourceUrl,
      sourceType: "blog-post",
      sourceWpId: page.wpPostId ?? wp?.id ?? null,
      targetModel: "BlogPost",
      data,
      references: {},
      unmapped: { wpModified: wp?.modified ?? null, seo: seoUnmapped },
      quality,
      ...recommend(page, quality),
    });
  }
  return out;
}
