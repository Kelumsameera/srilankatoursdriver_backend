/**
 * OLD WEBSITE → CMS migration: DISCOVERY + EXTRACTION phase (read-only).
 *
 *   npm run migration:discover              # crawl the old site politely, cache everything under migration/raw/
 *   npm run migration:discover -- --offline # re-run extraction + normalization from the cache (no network)
 *
 * Safety: this script only performs HTTP GET requests against the old public website and writes
 * local files under backend/migration/. It does not load .env, import mongoose, the Cloudinary SDK
 * or any application service, so it cannot read or write MongoDB or Cloudinary.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRAWL, OLD_SITE, PATHS } from "./config.js";
import { detectConflicts } from "./conflicts.js";
import {
  extractBookingItem,
  extractBusinessInfo,
  extractCssBackgrounds,
  extractDestination,
  extractExcursion,
  extractFaqs,
  extractFooter,
  extractGalleryImages,
  extractGeneric,
  extractInstagramFeed,
  extractNavigation,
  extractSections,
  extractTripadvisorReviews,
  type NavNode,
} from "./extract.js";
import { classifyUrl, refineClassification } from "./lib/classify.js";
import { loadHtml } from "./lib/html.js";
import { ensureDir, readJson, relPath, writeJson } from "./lib/io.js";
import { MediaCollector } from "./lib/media.js";
import { parseRobots, type RobotsRules } from "./lib/robots.js";
import { parseSitemap } from "./lib/sitemap.js";
import { sha256 } from "./lib/text.js";
import { isAssetUrl, isInternalUrl, normalizeUrl, slugFromUrl } from "./lib/url.js";
import {
  normalizeBlog,
  normalizeBrand,
  normalizeCategories,
  normalizeDestination,
  normalizeExcursion,
  normalizeFaqs,
  normalizeGallery,
  normalizeNavigation,
  normalizePages,
  normalizePageSections,
  normalizeReviews,
  normalizeSeoMetadata,
  normalizeSiteSettings,
  normalizeTour,
  normalizeVehicle,
  proposedNewPath,
  TOUR_LISTING_SUBTYPES,
  type NormalizeContext,
  type WpApiData,
} from "./normalize.js";
import { writeReports } from "./report.js";
import { cacheFileFor, PageSource } from "./source.js";
import type { DiscoveredUrl, MediaRole, NormalizedRecord, PageCategory, RawPage } from "./types.js";

interface Options {
  offline: boolean;
  maxPages: number;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { offline: false, maxPages: CRAWL.maxPages, delayMs: CRAWL.minDelayMs };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--offline") opts.offline = true;
    else if (a === "--max-pages") opts.maxPages = Math.max(1, Number(argv[++i]) || CRAWL.maxPages);
    else if (a === "--delay") opts.delayMs = Math.max(500, Number(argv[++i]) || CRAWL.minDelayMs);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: tsx migration/src/discover.ts [--offline] [--max-pages N] [--delay ms (>=500)]");
      process.exit(0);
    }
  }
  return opts;
}

const log = (m: string) => console.log(m);

export async function runDiscovery(opts: Options): Promise<void> {
  const startedAt = new Date().toISOString();
  log(`\n▶ Old-site discovery (${opts.offline ? "OFFLINE – cache only" : "online, read-only"}) – ${OLD_SITE.origin}`);
  log("  Writes ONLY local files under backend/migration/. No MongoDB, no Cloudinary.\n");
  for (const dir of [PATHS.raw, PATHS.rawHtml, PATHS.rawWpApi, PATHS.rawAssets, PATHS.normalized, PATHS.reports]) ensureDir(dir);

  const source = new PageSource(opts.offline, { minDelayMs: opts.delayMs, log });
  const previousUrls = new Map(readJson<DiscoveredUrl[]>(path.join(PATHS.raw, "urls.json"), []).map((u) => [u.url, u]));
  const now = new Date().toISOString();
  const discovered = new Map<string, DiscoveredUrl>();
  const discover = (raw: string | null | undefined, via: string, base?: string): string | null => {
    const url = normalizeUrl(raw, base);
    if (!url || !isInternalUrl(url)) return null;
    const existing = discovered.get(url);
    if (existing) {
      if (!existing.discoveredVia.includes(via)) existing.discoveredVia.push(via);
      return url;
    }
    discovered.set(url, {
      url,
      classification: classifyUrl(url),
      discoveredVia: [via],
      discoveredAt: previousUrls.get(url)?.discoveredAt ?? now,
      robotsAllowed: true,
      fetched: false,
      httpStatus: null,
      finalUrl: null,
      error: null,
      skippedReason: null,
    });
    return url;
  };

  /* 1. robots.txt */
  const robotsUrl = `${OLD_SITE.origin}/robots.txt`;
  const robotsRes = await source.get(robotsUrl, "text");
  let robots: RobotsRules | null = null;
  if (robotsRes.body && robotsRes.status === 200) {
    robots = parseRobots(robotsRes.body, CRAWL.userAgent);
    source.setRobots(robots);
    log(`✔ robots.txt: ${robots.disallow.length} disallow, ${robots.allow.length} allow, crawl-delay ${robots.crawlDelaySec ?? "none"}, ${robots.sitemaps.length} sitemap(s)`);
  } else log(`⚠ robots.txt unavailable (${robotsRes.error ?? robotsRes.status}) – crawling conservatively`);

  /* 2. sitemaps */
  const sitemapQueue = [...new Set([...(robots?.sitemaps ?? []), `${OLD_SITE.origin}/sitemap_index.xml`, `${OLD_SITE.origin}/sitemap.xml`, `${OLD_SITE.origin}/wp-sitemap.xml`].map((u) => normalizeUrl(u)).filter((u): u is string => Boolean(u)))];
  const sitemapsSeen = new Set<string>();
  const sitemapReport: { url: string; status: number | null; finalUrl: string; kind: string; urls: number; images: number; error: string | null }[] = [];
  const sitemapImages: { page: string; loc: string; title: string | null; caption: string | null }[] = [];
  while (sitemapQueue.length) {
    const sm = sitemapQueue.shift()!;
    if (sitemapsSeen.has(sm)) continue;
    sitemapsSeen.add(sm);
    const res = await source.get(sm, "xml");
    const finalUrl = normalizeUrl(res.finalUrl) ?? sm;
    if (finalUrl !== sm && sitemapsSeen.has(finalUrl)) {
      sitemapReport.push({ url: sm, status: res.status, finalUrl, kind: "alias", urls: 0, images: 0, error: null });
      continue;
    }
    sitemapsSeen.add(finalUrl);
    if (!res.body || (res.status ?? 0) >= 400) {
      sitemapReport.push({ url: sm, status: res.status, finalUrl, kind: "error", urls: 0, images: 0, error: res.error });
      continue;
    }
    const parsed = parseSitemap(res.body, finalUrl);
    const name = path.posix.basename(new URL(finalUrl).pathname);
    sitemapReport.push({ url: sm, status: res.status, finalUrl, kind: parsed.kind, urls: parsed.urls.length, images: parsed.urls.reduce((n, u) => n + u.images.length, 0), error: null });
    sitemapQueue.push(...parsed.sitemaps.filter((s) => isInternalUrl(s)));
    for (const entry of parsed.urls) {
      const url = discover(entry.loc, `sitemap:${name}`);
      if (url) for (const img of entry.images) sitemapImages.push({ page: url, ...img });
    }
  }
  log(`✔ sitemaps: ${sitemapReport.filter((s) => s.kind === "urlset").length} url sets, ${discovered.size} URLs`);

  /* 3. WordPress REST API (structured metadata; custom post types are NOT exposed there) */
  const wpSummary: Record<string, unknown> = { available: false };
  const wp: WpApiData = { siteName: null, siteDescription: null, posts: [], pages: [] };
  let wpMedia: Parameters<MediaCollector["enrichFromWpMedia"]>[0] = [];
  const rootRes = await source.get(`${OLD_SITE.origin}/wp-json/`, "json");
  if (rootRes.status === 200 && rootRes.body) {
    try {
      const root = JSON.parse(rootRes.body) as { name?: string; description?: string; namespaces?: string[]; routes?: Record<string, unknown> };
      wp.siteName = root.name ?? null;
      wp.siteDescription = root.description || null;
      wpSummary.available = true;
      wpSummary.name = root.name;
      wpSummary.description = root.description;
      wpSummary.namespaces = root.namespaces;
      wpSummary.customPostTypeRoutes = Object.keys(root.routes ?? {}).filter((r) => /\/wp\/v2\/(to_book|excursion|destination|offers)/.test(r));
    } catch (err) {
      wpSummary.error = `could not parse /wp-json/: ${(err as Error).message}`;
    }
    const typesRes = await source.get(`${OLD_SITE.origin}/wp-json/wp/v2/types`, "json");
    try {
      const types = JSON.parse(typesRes.body ?? "{}") as Record<string, { rest_base?: string; name?: string }>;
      wpSummary.restTypes = Object.fromEntries(Object.entries(types).map(([k, v]) => [k, v.rest_base]));
    } catch {
      wpSummary.restTypes = null;
    }
    const collect = async <T>(rest: string, fields?: string): Promise<{ items: T[]; errors: string[] }> => {
      const items: T[] = [];
      const errors: string[] = [];
      for (let page = 1; page <= 10; page += 1) {
        const url = `${OLD_SITE.origin}/wp-json/wp/v2/${rest}?page=${page}&per_page=100${fields ? `&_fields=${fields}` : ""}`;
        const res = await source.get(url, "json");
        if (res.status !== 200 || !res.body) {
          if (page === 1 || res.status !== 400) errors.push(`${rest} page ${page}: ${res.error ?? res.status}`);
          break;
        }
        try {
          const batch = JSON.parse(res.body) as T[];
          if (!Array.isArray(batch) || batch.length === 0) break;
          items.push(...batch);
          if (batch.length < 100) break;
        } catch (err) {
          errors.push(`${rest} page ${page}: invalid JSON (${(err as Error).message})`);
          break;
        }
      }
      return { items, errors };
    };
    const pages = await collect<WpApiData["pages"][number]>("pages", "id,slug,link,date,modified,parent,status,title,template");
    const posts = await collect<WpApiData["posts"][number]>("posts", "id,slug,link,date,modified,status,title,excerpt,content,categories,tags");
    const media = await collect<(typeof wpMedia)[number]>("media", "id,source_url,alt_text,caption,title,mime_type,media_type,media_details,post,date");
    const categories = await collect<{ id: number; name: string; slug: string; count: number }>("categories", "id,name,slug,count,link");
    const tags = await collect<{ id: number; name: string; slug: string; count: number }>("tags", "id,name,slug,count,link");
    const services = await collect<{ id: number; slug: string; link: string; title?: { rendered?: string } }>("service", "id,slug,link,title,status");
    wp.pages = pages.items;
    wp.posts = posts.items;
    wpMedia = media.items;
    for (const p of wp.pages) discover(p.link, "wp-api:pages");
    for (const p of wp.posts) discover(p.link, "wp-api:posts");
    for (const s of services.items) discover(s.link, "wp-api:service");
    wpSummary.counts = { pages: pages.items.length, posts: posts.items.length, media: media.items.length, categories: categories.items.length, tags: tags.items.length, services: services.items.length };
    wpSummary.errors = [...pages.errors, ...posts.errors, ...media.errors, ...categories.errors, ...tags.errors, ...services.errors];
    wpSummary.categories = categories.items.map((c) => ({ name: c.name, slug: c.slug, count: c.count }));
    wpSummary.tags = tags.items.map((t) => ({ name: t.name, slug: t.slug, count: t.count }));
    writeJson(path.join(PATHS.rawWpApi, "summary.json"), wpSummary);
    log(`✔ WordPress REST: ${pages.items.length} pages, ${posts.items.length} posts, ${media.items.length} media items (custom post types not exposed)`);
  } else {
    wpSummary.error = rootRes.error ?? `HTTP ${rootRes.status}`;
    log(`⚠ WordPress REST API not available (${wpSummary.error}) – HTML extraction only`);
  }

  /* 4. Crawl HTML pages (sitemap + REST seeds, then internal links) */
  const media = new MediaCollector();
  const pages: RawPage[] = [];
  const processedFinal = new Set<string>();
  let fetchedCount = 0;
  const queue = () => [...discovered.values()].filter((u) => !u.fetched && !u.skippedReason);

  for (let next = queue(); next.length; next = queue()) {
    for (const entry of next.sort((a, b) => a.url.localeCompare(b.url))) {
      const c = entry.classification;
      if (c.category === "asset") {
        entry.skippedReason = "asset (recorded as media, not crawled)";
        continue;
      }
      if (c.category === "system") {
        entry.skippedReason = `system/utility page – not fetched (${c.reasons.join("; ")})`;
        continue;
      }
      if (!source.isAllowed(entry.url)) {
        entry.robotsAllowed = false;
        entry.skippedReason = "disallowed by robots.txt";
        continue;
      }
      if (fetchedCount >= opts.maxPages) {
        entry.skippedReason = `page cap reached (--max-pages ${opts.maxPages})`;
        continue;
      }
      fetchedCount += 1;
      const res = await source.get(entry.url, "html");
      entry.fetched = true;
      entry.httpStatus = res.status;
      entry.finalUrl = normalizeUrl(res.finalUrl) ?? res.finalUrl;
      entry.error = res.error;
      const label = `${String(res.status ?? "ERR").padEnd(3)} ${entry.url}${entry.finalUrl !== entry.url ? ` → ${entry.finalUrl}` : ""}`;
      log(`  ${res.error && !res.body ? "✖" : "·"} ${label}${res.error ? ` (${res.error})` : ""}`);

      if (entry.finalUrl && entry.finalUrl !== entry.url) {
        discover(entry.finalUrl, `redirect-from:${entry.url}`);
        const target = discovered.get(entry.finalUrl);
        if (target && !target.fetched) {
          // The redirect target's HTML is the same response – record it once under the final URL.
          target.fetched = true;
          target.httpStatus = res.status;
          target.finalUrl = entry.finalUrl;
          target.error = res.error;
        }
      }
      const finalUrl = entry.finalUrl ?? entry.url;
      if (!res.body || !/html/i.test(res.contentType ?? "text/html") || (res.status ?? 0) >= 400) continue;
      if (processedFinal.has(finalUrl)) continue;
      processedFinal.add(finalUrl);

      const page = extractPage(finalUrl, res.body, discovered.get(finalUrl) ?? entry, media);
      page.httpStatus = res.status;
      page.fetchedAt = source.fetchedAt(entry.url) ?? new Date().toISOString();
      page.rawHtmlFile = relPath(PATHS.root, cacheFileFor(entry.url, "html"));
      pages.push(page);
      const record = discovered.get(finalUrl);
      if (record) record.classification = page.classification;
      for (const l of page.generic?.links.internal ?? []) {
        if (!isAssetUrl(l.href)) discover(l.href, `link:${finalUrl}`);
      }
    }
  }
  log(`✔ crawl: ${fetchedCount} page requests, ${pages.length} HTML pages extracted`);

  /* 5. Media: sitemap images, Elementor background CSS, WP media metadata */
  for (const img of sitemapImages) {
    const page = pages.find((p) => p.sourceUrl === img.page);
    media.add({ url: img.loc, sourcePage: img.page, pageCategory: page?.sourceType ?? "page", role: "content", title: img.title, caption: img.caption });
  }
  const cssPages = new Map<string, RawPage[]>();
  for (const p of pages) {
    if (p.classification.excludeFromImport) continue;
    for (const css of p.generic?.elementorCss ?? []) {
      if (p.wpPostId && !new RegExp(`post-${p.wpPostId}\\.css`).test(css)) continue;
      cssPages.set(css, [...(cssPages.get(css) ?? []), p]);
    }
  }
  for (const [cssUrl, owners] of [...cssPages.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 60)) {
    const res = await source.get(cssUrl, "css");
    if (!res.body || (res.status ?? 0) >= 400) continue;
    for (const bg of extractCssBackgrounds(res.body, cssUrl)) {
      for (const owner of owners) media.add({ url: bg.url, sourcePage: owner.sourceUrl, pageCategory: owner.sourceType, role: "background" });
    }
  }
  const wpMatched = media.enrichFromWpMedia(wpMedia);
  log(`✔ media: ${media.size} unique URLs (${wpMatched} enriched from WP REST metadata)`);

  /* 6. Normalize into the EXISTING CMS models */
  const pagesByUrl = new Map(pages.map((p) => [p.sourceUrl, p]));
  const home = pages.find((p) => p.classification.category === "homepage");
  const nav: NavNode[] = home?.navigation ?? [];
  const navLabels = new Map<string, string>();
  const walkNav = (nodes: NavNode[]) => nodes.forEach((n) => (n.url && navLabels.set(n.url, n.label), walkNav(n.children)));
  walkNav(nav);

  const listingMembership = new Map<string, Set<string>>();
  for (const p of pages) {
    const c = p.classification;
    if (c.category !== "tours" || !c.isListing || !TOUR_LISTING_SUBTYPES.has(c.subtype ?? "") || c.excludeFromImport) continue;
    const name = navLabels.get(p.sourceUrl) ?? p.generic?.h1[0] ?? p.generic?.pageTitle ?? String(c.subtype);
    // Content links only: the footer "Most Popular" menu links to the same tours from every page.
    for (const href of p.generic?.contentLinks ?? []) {
      if (/\/(to_book|offers)\/[^/]+\/$/.test(href)) (listingMembership.get(href) ?? listingMembership.set(href, new Set()).get(href)!).add(name);
    }
  }
  const homepageFeatures = new Map<string, Set<string>>();
  for (const s of home?.sections ?? []) {
    for (const u of s.linkedItems) (homepageFeatures.get(u) ?? homepageFeatures.set(u, new Set()).get(u)!).add(s.headings[0] ?? s.typeGuess);
  }
  const ctx: NormalizeContext = { media, listingMembership, homepageFeatures, wp };

  const byCategory = (cat: PageCategory, listing = false) => pages.filter((p) => p.classification.category === cat && p.classification.isListing === listing);
  const pageLike = pages.filter((p) => ["homepage", "page", "about", "contact", "faq", "gallery", "reviews"].includes(p.classification.category) || p.classification.isListing);
  const site = normalizeSiteSettings(ctx, pages, pagesByUrl);
  const datasets: Record<string, NormalizedRecord[]> = {
    tours: byCategory("tour-detail").map((p) => normalizeTour(ctx, p)),
    vehicles: byCategory("vehicle").map((p) => normalizeVehicle(ctx, p)),
    destinations: byCategory("destination").map((p) => normalizeDestination(ctx, p)),
    excursions: byCategory("excursion").map((p) => normalizeExcursion(ctx, p)),
    "blog-posts": normalizeBlog(ctx, pages),
    faqs: normalizeFaqs(pages),
    reviews: normalizeReviews(pages),
    gallery: normalizeGallery(ctx, pages),
    pages: normalizePages(ctx, pageLike),
    "page-sections": normalizePageSections(ctx, pageLike, pagesByUrl),
    categories: normalizeCategories(pages, nav),
    navigation: normalizeNavigation(nav, home, pagesByUrl),
    "site-settings": [site.record],
    "brand-settings": [normalizeBrand(ctx, home)],
    seo: normalizeSeoMetadata(ctx, pages),
  };
  const conflicts = detectConflicts(datasets, [...discovered.values()], pages);

  /* 7. Write raw + normalized datasets (deterministic order → idempotent) */
  const sortPages = (list: RawPage[]) => [...list].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  const rawGroups: Record<string, RawPage[]> = {
    pages: pages.filter((p) => !["tour-detail", "vehicle", "destination", "excursion", "blog"].includes(p.classification.category) || p.classification.isListing),
    tours: byCategory("tour-detail"),
    vehicles: byCategory("vehicle"),
    destinations: byCategory("destination"),
    excursions: byCategory("excursion"),
    blog: byCategory("blog"),
  };
  for (const [name, list] of Object.entries(rawGroups)) writeJson(path.join(PATHS.raw, `${name}.json`), sortPages(list));
  writeJson(path.join(PATHS.raw, "urls.json"), [...discovered.values()].sort((a, b) => a.url.localeCompare(b.url)));
  writeJson(path.join(PATHS.raw, "sitemaps.json"), { sitemaps: sitemapReport, images: sitemapImages });
  writeJson(path.join(PATHS.raw, "robots.json"), robots ?? { error: robotsRes.error ?? robotsRes.status });
  writeJson(path.join(PATHS.raw, "media.json"), media.list());
  writeJson(
    path.join(PATHS.raw, "faq.json"),
    sortPages(pages).flatMap((p) => (p.faqs ?? []).map((f) => ({ sourcePage: p.sourceUrl, ...f }))),
  );
  writeJson(
    path.join(PATHS.raw, "reviews.json"),
    sortPages(pages).flatMap((p) => (p.reviews ?? []).map((r) => ({ sourcePage: p.sourceUrl, ...r }))),
  );
  writeJson(path.join(PATHS.raw, "gallery.json"), {
    instagram: sortPages(pages).flatMap((p) => (p.instagram ?? []).map((i) => ({ sourcePage: p.sourceUrl, ...i }))),
    images: sortPages(pages).flatMap((p) => (p.galleryImages ?? []).map((i) => ({ sourcePage: p.sourceUrl, ...i }))),
  });
  writeJson(path.join(PATHS.raw, "business.json"), site.evidence);
  writeJson(path.join(PATHS.raw, "navigation.json"), { header: nav, footer: home?.footer ?? null });

  for (const [name, records] of Object.entries(datasets)) {
    writeJson(path.join(PATHS.normalized, `${name}.json`), {
      targetModel: records[0]?.targetModel ?? null,
      count: records.length,
      note: "data = fields of the EXISTING CMS model only; media url fields still point to the old site (Cloudinary upload is a later phase); ObjectId references are resolved at import time from `references`.",
      records,
    });
  }
  writeJson(path.join(PATHS.normalized, "media.json"), {
    note: "Media to upload to Cloudinary in a later phase. Nothing has been downloaded or uploaded. Size variants are grouped under originalUrl.",
    count: media.size,
    records: media.list().map((m) => ({ ...m, targetModel: "Media", proposedFolder: m.usedFor[0] ?? "misc" })),
  });
  writeJson(path.join(PATHS.normalized, "translations.json"), {
    note: "No translations extracted. The old site is English-only (html lang en-US, no hreflang alternates). The GTranslate plugin translates in the browser on the fly and stores nothing – English is the source/master content for the CMS translation system.",
    records: [],
  });
  writeJson(path.join(PATHS.normalized, "guest-shorts.json"), {
    note: "No guest short videos found on the old site (no YouTube Shorts / Reels / TikTok embeds). Instagram videos in gallery.json are NOT assumed to show guests.",
    records: [],
  });
  writeJson(
    path.join(PATHS.reports, "url-map.json"),
    [...discovered.values()]
      .filter((u) => u.fetched && !u.classification.excludeFromImport && u.classification.category !== "asset")
      .map((u) => ({ oldUrl: u.url, category: u.classification.category, proposedNewPath: proposedNewPath({ sourceUrl: u.url, classification: u.classification }), httpStatus: u.httpStatus }))
      .sort((a, b) => a.oldUrl.localeCompare(b.oldUrl)),
  );
  source.saveIndex();

  /* 8. Reports */
  writeReports({
    startedAt,
    finishedAt: new Date().toISOString(),
    offline: opts.offline,
    urls: [...discovered.values()],
    pages,
    datasets,
    media,
    conflicts,
    sitemaps: sitemapReport,
    wpSummary,
    robots,
    fetchStats: source.stats,
    business: site.evidence,
  });
  log(`\n✔ Done. Review migration/reports/discovery-report.md`);
  log("  NO MongoDB data was read or modified. NO media was uploaded to Cloudinary.\n");
}

/** Parses one HTML page and runs every extractor that applies to its category. */
export function extractPage(url: string, html: string, entry: DiscoveredUrl, media: MediaCollector): RawPage {
  const $ = loadHtml(html);
  const parsingErrors: string[] = [];
  const page: RawPage = {
    sourceUrl: url,
    finalUrl: url,
    sourceType: entry.classification.category,
    classification: entry.classification,
    httpStatus: null,
    title: null,
    rawHtmlFile: null,
    rawHtmlSha256: sha256(html),
    rawHtmlBytes: Buffer.byteLength(html),
    extractedText: "",
    discoveredAt: entry.discoveredAt,
    fetchedAt: null,
    discoveredVia: entry.discoveredVia,
    wpPostId: null,
    wpPostType: null,
    error: null,
    parsingErrors,
    generic: null,
  };
  const attempt = <T>(name: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      parsingErrors.push(`${name}: ${(err as Error).message}`);
      return undefined;
    }
  };

  const generic = attempt("generic", () => extractGeneric($, url));
  if (generic) {
    const { extractedText, ...rest } = generic;
    page.generic = rest;
    page.extractedText = extractedText;
    page.title = generic.title;
    page.wpPostId = generic.wpPostId;
    page.wpPostType = generic.wpPostType;
    page.classification = refineClassification(entry.classification, { bodyClasses: generic.bodyClasses, title: generic.title, text: extractedText, slug: slugFromUrl(url) });
    page.sourceType = page.classification.category;
  }
  const c = page.classification;
  const isItem = !c.isListing;
  if ((c.category === "tour-detail" || c.category === "vehicle") && isItem) page.booking = attempt("booking-item", () => extractBookingItem($, url));
  if (c.category === "excursion" && isItem) page.excursion = attempt("excursion", () => extractExcursion($, url));
  if (c.category === "destination" && isItem) page.destination = attempt("destination", () => extractDestination($, url));
  page.faqs = attempt("faqs", () => extractFaqs($, url)) ?? [];
  page.reviews = attempt("reviews", () => extractTripadvisorReviews($, url)) ?? [];
  page.instagram = attempt("instagram", () => extractInstagramFeed($, url)) ?? [];
  page.galleryImages = ["gallery", "page", "about", "homepage"].includes(c.category) && !c.excludeFromImport ? (attempt("gallery", () => extractGalleryImages($, url)) ?? []) : [];
  page.business = attempt("business", () => extractBusinessInfo($, url));
  if (c.category === "homepage") {
    page.navigation = attempt("navigation", () => extractNavigation($, url)) ?? [];
    page.footer = attempt("footer", () => extractFooter($, url));
  }
  if (["homepage", "page", "about", "contact", "faq", "gallery", "reviews"].includes(c.category) || c.isListing) page.sections = attempt("sections", () => extractSections($, url)) ?? [];
  if (page.booking && !page.booking.title) parsingErrors.push("booking-item: no title found");
  if (c.category === "excursion" && isItem && page.excursion && !page.excursion.rates.length) parsingErrors.push("excursion: no rate table found");

  collectMedia($, page, media);
  return page;
}

function collectMedia($: ReturnType<typeof loadHtml>, page: RawPage, media: MediaCollector): void {
  const cat = page.sourceType;
  const add = (url: string | null | undefined, role: MediaRole, altText?: string | null, extra: { caption?: string | null; width?: number | null; height?: number | null } = {}) => {
    if (url) media.add({ url, sourcePage: page.sourceUrl, pageCategory: cat, role, altText, ...extra });
  };
  const g = page.generic;
  if (!g) return;
  add(g.seo.og.image, "og-image", g.seo.og["image:alt"]);
  const heroFirst = cat === "destination" || cat === "excursion";
  g.images.forEach((img, i) => {
    const role: MediaRole = /\/wp-content\/(plugins|themes)\//.test(img.url) ? "ui-asset" : /avatar/i.test(img.url) ? "avatar" : heroFirst && i === 0 ? "hero" : "content";
    add(img.url, role, img.alt, img);
    for (const alt of img.alternates) add(alt, role, img.alt);
  });
  for (const img of page.booking?.galleryImages ?? []) {
    add(img.url, "gallery", img.alt, img);
    for (const alt of img.alternates) add(alt, "gallery", img.alt);
  }
  for (const img of page.galleryImages ?? []) add(img.url, "gallery", img.alt, img);
  for (const bg of g.backgroundImages) add(bg, cat === "homepage" ? "hero" : "background");
  for (const v of g.videos) add(v.url, "video");
  for (const r of page.reviews ?? []) add(r.avatarUrl, "avatar", r.guestName);
  for (const item of page.instagram ?? []) add(item.mediaUrl, "instagram", null, { caption: item.caption });
  $('.elementor-widget-theme-site-logo img, .site-logo img, img.custom-logo, [data-elementor-type="header"] img[src*="logo"]').each((_, el) => {
    add(normalizeUrl($(el).attr("src"), page.sourceUrl), "logo", $(el).attr("alt"));
  });
  $('link[rel~="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const size = Number(($(el).attr("sizes") ?? "").split("x")[0]) || null;
    add(normalizeUrl($(el).attr("href"), page.sourceUrl), "favicon", null, { width: size, height: size });
  });
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runDiscovery(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error("✖ discovery failed:", err);
    process.exit(1);
  });
}
