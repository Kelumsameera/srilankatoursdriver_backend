import type { Classification, PageCategory } from "../types.js";
import { isAssetUrl, isInternalUrl, pathSegments, slugFromUrl } from "./url.js";

/** WordPress plugin / checkout / utility pages that are not content. */
const SYSTEM_SLUGS = new Set([
  "my-account",
  "checkout",
  "cart",
  "confirmation",
  "customer-confirmation",
  "admin-confirmation",
  "search-result",
  "all-items",
  "add_services",
  "ba-wishlist",
  "tours-list-top-search",
  "icons",
  "wp-login.php",
  "xmlrpc.php",
  "feed",
  "comments",
]);

/** Exact single-segment page slugs → category. */
const PAGE_SLUGS: Record<string, { category: PageCategory; isListing?: boolean; subtype?: string }> = {
  "about-us": { category: "about" },
  about: { category: "about" },
  contact: { category: "contact" },
  "contact-us": { category: "contact" },
  faq: { category: "faq" },
  faqs: { category: "faq" },
  gallery: { category: "gallery" },
  reviews: { category: "reviews" },
  testimonials: { category: "reviews" },
  tours: { category: "tours", isListing: true },
  "all-tours": { category: "tours", isListing: true, subtype: "all-tours-alias" },
  "sri-lanka-round-tours": { category: "tours", isListing: true, subtype: "round-tours" },
  "sri-lanka-one-day-tours": { category: "tours", isListing: true, subtype: "one-day-tours" },
  "per-day-basis-tours-sri-lanka": { category: "tours", isListing: true, subtype: "per-day-basis" },
  "sri-lanka-tour-offers": { category: "tours", isListing: true, subtype: "offers" },
  "destination-list": { category: "destination", isListing: true },
  destinations: { category: "destination", isListing: true },
  excursions: { category: "excursion", isListing: true },
  "drivers-guides": { category: "vehicle", isListing: true, subtype: "drivers-guides" },
  vehicles: { category: "vehicle", isListing: true },
  "tailor-made-tours": { category: "page", subtype: "tailor-made" },
  "privacy-policy": { category: "page", subtype: "legal" },
  "terms-conditions": { category: "page", subtype: "legal" },
  "terms-and-conditions": { category: "page", subtype: "legal" },
  "cookie-policy": { category: "page", subtype: "legal" },
  blog: { category: "blog", isListing: true },
};

/** Custom post type base → category (WordPress rewrite slugs seen on the old site). */
const POST_TYPE_BASES: Record<string, { category: PageCategory; subtype?: string }> = {
  to_book: { category: "tour-detail" },
  offers: { category: "tour-detail", subtype: "offer" },
  destination: { category: "destination" },
  excursion: { category: "excursion", subtype: "transfer-rates" },
  services: { category: "system", subtype: "booking-service" },
  ba_locations: { category: "other", subtype: "location-taxonomy" },
  "ba-locations": { category: "other", subtype: "location-taxonomy" },
  category: { category: "other", subtype: "taxonomy" },
  tag: { category: "other", subtype: "taxonomy" },
  author: { category: "system", subtype: "author-archive" },
};

const VEHICLE_SLUG_TOKENS = /(^|-)(car|van|bus|suv|minivan|coach|tuk-?tuk|highroof|jeep)(-|$)/;

/** Slugs that look like test / draft / duplicate builder pages. */
export function isLikelyTestContent(slugOrTitle: string | null | undefined): boolean {
  if (!slugOrTitle) return false;
  const s = slugOrTitle.toLowerCase().trim();
  return (
    /(^|[\s_-])test([\s_-]?\d*)([\s_-]|$)/.test(s) ||
    /^test\d*$/.test(s) ||
    /^home-\d+$/.test(s) ||
    /^elementor-\d+$/.test(s) ||
    /^(sample-page|hello-world|draft)$/.test(s)
  );
}

function result(category: PageCategory, opts: Partial<Omit<Classification, "category">> = {}): Classification {
  return {
    category,
    isListing: opts.isListing ?? false,
    subtype: opts.subtype ?? null,
    excludeFromImport: opts.excludeFromImport ?? (category === "system" || category === "asset"),
    reasons: opts.reasons ?? [],
  };
}

/** Classifies an old-site URL from its path alone (refined later with page content). */
export function classifyUrl(url: string): Classification {
  if (!isInternalUrl(url)) return result("other", { excludeFromImport: true, reasons: ["external URL"] });
  if (isAssetUrl(url)) return result("asset", { reasons: ["asset path / file extension"] });

  const u = new URL(url);
  const segs = pathSegments(url);

  // Archive pagination (/tours/page/2/, ?paged=2) duplicates its parent listing.
  const pageIdx = segs.indexOf("page");
  if ((pageIdx >= 0 && /^\d+$/.test(segs[pageIdx + 1] ?? "")) || u.searchParams.has("paged")) {
    const parent = new URL(url);
    parent.search = "";
    parent.pathname = `/${(pageIdx >= 0 ? segs.slice(0, pageIdx) : segs).join("/")}${segs.length ? "/" : ""}`.replace(/\/{2,}/g, "/");
    const base = classifyUrl(parent.toString());
    return {
      ...base,
      category: base.category === "tour-detail" ? "tours" : base.category,
      isListing: true,
      subtype: "pagination",
      excludeFromImport: true,
      reasons: [`pagination of ${parent.pathname}`],
    };
  }

  if (segs.length === 0) {
    if (u.searchParams.has("page_id") || u.searchParams.has("p")) {
      return result("other", { excludeFromImport: true, reasons: ["query-string permalink (?page_id / ?p) – resolves via redirect"] });
    }
    if (u.searchParams.has("s")) return result("system", { reasons: ["search results"] });
    return result("homepage", { reasons: ["site root"] });
  }
  if (segs[0] === "wp-admin" || segs[0] === "wp-json" || segs[0] === "cdn-cgi") return result("system", { reasons: [`/${segs[0]}/ path`] });
  if (segs.includes("feed") || segs.includes("embed") || segs.includes("trackback")) return result("system", { reasons: ["feed/embed endpoint"] });

  const first = segs[0];
  const slug = slugFromUrl(url) ?? "";

  const postType = POST_TYPE_BASES[first];
  if (postType) {
    if (segs.length === 1) {
      const listingCategory: PageCategory = postType.category === "tour-detail" ? "tours" : postType.category;
      return result(listingCategory, {
        isListing: true,
        subtype: `${first}-archive`,
        excludeFromImport: listingCategory === "system" || listingCategory === "other",
        reasons: [`/${first}/ archive`],
      });
    }
    let category = postType.category;
    const reasons = [`/${first}/<slug>/ single item`];
    if (first === "to_book" && VEHICLE_SLUG_TOKENS.test(slug)) {
      category = "vehicle";
      reasons.push("slug names a vehicle type");
    }
    const test = isLikelyTestContent(slug);
    return result(category, { subtype: postType.subtype ?? null, excludeFromImport: category === "system" || category === "other" || test, reasons: test ? [...reasons, "looks like test content"] : reasons });
  }

  if (segs.length === 1) {
    if (SYSTEM_SLUGS.has(slug)) return result("system", { reasons: ["plugin / checkout / utility page"] });
    if (isLikelyTestContent(slug)) return result("system", { subtype: "test", reasons: ["looks like test / builder draft page"] });
    const known = PAGE_SLUGS[slug];
    if (known) return result(known.category, { isListing: known.isListing ?? false, subtype: known.subtype ?? null, reasons: ["known page slug"] });
    return result("page", { reasons: ["single-segment page"] });
  }

  // /YYYY/MM/slug/ style blog permalinks
  if (/^\d{4}$/.test(first)) return result("blog", { reasons: ["date-based post permalink"] });
  if (first === "blog") return result("blog", { reasons: ["/blog/ path"] });
  return result("other", { reasons: ["unrecognised multi-segment path"] });
}

export interface PageSignals {
  bodyClasses: string[];
  title: string | null;
  text: string;
  slug: string | null;
}

/** Refines a URL classification with what the fetched page actually contains. */
export function refineClassification(base: Classification, signals: PageSignals): Classification {
  const c: Classification = { ...base, reasons: [...base.reasons] };
  const bc = new Set(signals.bodyClasses);
  if (bc.has("single-post")) {
    c.category = "blog";
    c.isListing = false;
    c.reasons.push("body.single-post");
  } else if (bc.has("single-destination")) {
    c.category = "destination";
    c.reasons.push("body.single-destination");
  } else if (bc.has("single-excursion")) {
    c.category = "excursion";
    c.subtype = "transfer-rates";
    c.reasons.push("body.single-excursion");
  } else if (bc.has("single-to_book") || c.category === "tour-detail" || c.category === "vehicle") {
    if (isVehicleContent(signals)) {
      if (c.category !== "vehicle") c.reasons.push("content describes a driver + vehicle");
      c.category = "vehicle";
    } else if (c.category === "vehicle") {
      c.reasons.push("slug suggested vehicle but content has no vehicle/driver details");
    }
  }
  if (!c.excludeFromImport && (isLikelyTestContent(signals.slug) || isLikelyTestContent(signals.title))) {
    c.excludeFromImport = true;
    c.reasons.push("looks like test content");
  }
  return c;
}

export function isVehicleContent(signals: Pick<PageSignals, "text" | "title" | "slug">): boolean {
  const text = signals.text ?? "";
  if (/type of vehicle\s*:/i.test(text) || /years of experience\s*:/i.test(text)) return true;
  if (/\bdriver for hire\b/i.test(text) && VEHICLE_SLUG_TOKENS.test(signals.slug ?? "")) return true;
  return /\s[–-]\s(car|van|bus|suv|kdh|highroof|mini ?van|coach)\b/i.test(signals.title ?? "");
}
