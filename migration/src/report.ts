import path from "node:path";
import { OLD_SITE, PATHS } from "./config.js";
import type { ConflictReport } from "./conflicts.js";
import { writeJson, writeText } from "./lib/io.js";
import type { MediaCollector } from "./lib/media.js";
import type { RobotsRules } from "./lib/robots.js";
import type { DiscoveredUrl, NormalizedRecord, RawPage } from "./types.js";

export interface ReportInput {
  startedAt: string;
  finishedAt: string;
  offline: boolean;
  urls: DiscoveredUrl[];
  pages: RawPage[];
  datasets: Record<string, NormalizedRecord[]>;
  media: MediaCollector;
  conflicts: ConflictReport;
  sitemaps: { url: string; status: number | null; finalUrl: string; kind: string; urls: number; images: number; error: string | null }[];
  wpSummary: Record<string, unknown>;
  robots: RobotsRules | null;
  fetchStats: { requests: number; retries: number; failures: number; blockedByRobots: number };
  business: Record<string, unknown>;
}

const EXTRACTION_METHOD =
  "Hybrid. Primary: sitemap_index.xml (Rank Math/Yoast-style) + polite HTML extraction of every public page (cheerio, no JS execution). " +
  "Supplementary: the public WordPress REST API (/wp-json/wp/v2) for page/post metadata and media alt text/dimensions. " +
  "The REST API was NOT used for content because the site's custom post types (to_book, destination, excursion, offers – BA Book Everything plugin) are not exposed there, " +
  "and tour prices, durations, itineraries and inclusions are rendered by theme widgets rather than stored in post content.";

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function datasetSummary(records: NormalizedRecord[]) {
  return {
    total: records.length,
    import: records.filter((r) => r.recommendation === "import").length,
    review: records.filter((r) => r.recommendation === "review").length,
    skip: records.filter((r) => r.recommendation === "skip").length,
    qualityOk: records.filter((r) => r.quality.status === "ok").length,
    qualityPartial: records.filter((r) => r.quality.status === "partial").length,
    qualityFailed: records.filter((r) => r.quality.status === "failed").length,
  };
}

function missingByField(records: NormalizedRecord[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of records.filter((x) => x.recommendation !== "skip")) for (const f of r.quality.missingFields) (out[f] ??= []).push(r.sourceUrl);
  return out;
}

const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (headers: string[], rows: unknown[][]) =>
  rows.length ? [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n") : "_none_";

export function writeReports(input: ReportInput): void {
  const { urls, pages, datasets, media, conflicts } = input;
  const fetched = urls.filter((u) => u.fetched);
  const ok = fetched.filter((u) => u.httpStatus !== null && u.httpStatus < 400 && !u.error);
  const failed = fetched.filter((u) => u.httpStatus === null || u.httpStatus >= 400 || u.error);
  const httpErrors = failed.map((u) => ({ url: u.url, status: u.httpStatus, error: u.error, discoveredVia: u.discoveredVia }));
  const parsingErrors = pages.filter((p) => p.parsingErrors.length).map((p) => ({ url: p.sourceUrl, errors: p.parsingErrors }));
  const mediaList = media.list();
  const mediaDup = media.duplicateReport();
  const active = (name: string) => (datasets[name] ?? []).filter((r) => r.recommendation !== "skip").length;
  const counts = {
    tours: active("tours"),
    tourOffers: (datasets.tours ?? []).filter((r) => r.sourceType === "tour-offer" && r.recommendation !== "skip").length,
    destinations: active("destinations"),
    excursions: active("excursions"),
    vehicles: active("vehicles"),
    blogPosts: active("blog-posts"),
    galleryItems: active("gallery"),
    reviews: active("reviews"),
    faqs: active("faqs"),
    pages: active("pages"),
    pageSectionCandidates: active("page-sections"),
    tourCategories: active("categories"),
    navigationItems: active("navigation"),
    mediaAssets: mediaList.length,
    mediaForImport: mediaList.filter((m) => !m.excludeFromImport && !m.isSizeVariant).length,
  };
  const missing = Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, missingByField(v)]).filter(([, v]) => Object.keys(v as object).length));

  const report = {
    website: OLD_SITE.origin,
    mode: input.offline ? "offline (re-parsed from cache)" : "online",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    extractionMethod: EXTRACTION_METHOD,
    safety: {
      mongodbAccessed: false,
      cloudinaryAccessed: false,
      mediaDownloaded: false,
      note: "The discovery script imports no database/Cloudinary/application modules and only performs HTTP GET requests against the old public website.",
    },
    robots: input.robots,
    requests: input.fetchStats,
    sitemaps: input.sitemaps,
    wordpressApi: input.wpSummary,
    urls: {
      totalDiscovered: urls.length,
      fetched: fetched.length,
      fetchedSuccessfully: ok.length,
      failed: failed.length,
      skipped: urls.filter((u) => u.skippedReason).length,
      skippedReasons: countBy(
        urls.filter((u) => u.skippedReason),
        (u) => u.skippedReason!.replace(/\(.*\)$/, "").trim(),
      ),
      byCategory: countBy(urls, (u) => `${u.classification.category}${u.classification.isListing ? " (listing)" : ""}`),
      excludedFromImport: urls.filter((u) => u.classification.excludeFromImport).map((u) => ({ url: u.url, reasons: u.classification.reasons })),
      discoveredOnlyViaLinks: urls.filter((u) => u.discoveredVia.every((v) => v.startsWith("link:") || v.startsWith("redirect-from:"))).map((u) => u.url),
    },
    counts,
    datasets: Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, datasetSummary(v)])),
    httpErrors,
    parsingErrors,
    duplicates: {
      urlAliases: conflicts.urlAliases,
      duplicateSlugs: conflicts.duplicateSlugs,
      duplicateTitles: conflicts.duplicateTitles,
      identicalContent: conflicts.identicalContent,
      media: { sizeVariantGroups: mediaDup.sizeVariantGroups.length, sameFilenameDifferentFolders: mediaDup.sameFilenameDifferentFolders, urlAliases: mediaDup.urlAliases.length },
    },
    missingImportantFields: missing,
    media: {
      total: mediaList.length,
      byType: countBy(mediaList, (m) => m.mediaType),
      byRole: countBy(
        mediaList.flatMap((m) => m.roles.map((r) => ({ r }))),
        (x) => x.r,
      ),
      sizeVariants: mediaList.filter((m) => m.isSizeVariant).length,
      excludedFromImport: mediaList.filter((m) => m.excludeFromImport).length,
      hostedExternally: mediaList.filter((m) => m.hostedExternally).length,
      withAltText: mediaList.filter((m) => m.altText).length,
      withDimensions: mediaList.filter((m) => m.width).length,
    },
    translations: "None extracted – the old site is English-only; GTranslate translates client-side and stores nothing.",
    notMigratable: [
      "Bookings and tailor-made enquiries: private customer data held in the WordPress database / mailbox – not publicly available and intentionally NOT scraped.",
      "Contact form submissions (Contact Form 7 / Forminator / WPForms): not public.",
    ],
  };
  writeJson(path.join(PATHS.reports, "discovery-report.json"), report);
  writeJson(path.join(PATHS.reports, "conflicts.json"), { ...conflicts, media: mediaDup });
  writeJson(
    path.join(PATHS.reports, "quality.json"),
    Object.fromEntries(
      Object.entries(datasets).map(([k, records]) => [
        k,
        records.map((r) => ({
          sourceUrl: r.sourceUrl,
          title: (r.data as Record<string, unknown>).title ?? (r.data as Record<string, unknown>).name ?? (r.data as Record<string, unknown>).question ?? (r.data as Record<string, unknown>).label ?? null,
          recommendation: r.recommendation,
          reason: r.recommendationReason,
          ...r.quality,
        })),
      ]),
    ),
  );
  writeText(path.join(PATHS.reports, "discovery-report.md"), renderMarkdown(input, report, counts, missing, httpErrors, parsingErrors, mediaDup));
  writeText(path.join(PATHS.reports, "business-data.md"), renderBusiness(input));
}

function renderMarkdown(
  input: ReportInput,
  report: { urls: { byCategory: Record<string, number>; totalDiscovered: number; fetched: number; fetchedSuccessfully: number; failed: number; skipped: number; skippedReasons: Record<string, number>; discoveredOnlyViaLinks: string[] }; datasets: Record<string, ReturnType<typeof datasetSummary>>; media: Record<string, unknown> },
  counts: Record<string, number>,
  missing: Record<string, unknown>,
  httpErrors: { url: string; status: number | null; error: string | null; discoveredVia: string[] }[],
  parsingErrors: { url: string; errors: string[] }[],
  mediaDup: ReturnType<MediaCollector["duplicateReport"]>,
): string {
  const { datasets, conflicts } = input;
  const L: string[] = [];
  L.push(`# Old website discovery report`, "");
  L.push(`- **Website:** ${OLD_SITE.origin}`);
  L.push(`- **Run:** ${input.startedAt} → ${input.finishedAt} (${input.offline ? "offline re-parse of the cache" : "online crawl"})`);
  L.push(`- **Requests:** ${input.fetchStats.requests} (retries ${input.fetchStats.retries}, failures ${input.fetchStats.failures}, blocked by robots ${input.fetchStats.blockedByRobots}); ≥1 s between requests`);
  L.push("", "> **Read-only phase.** Nothing was written to MongoDB, nothing was uploaded to Cloudinary and no media files were downloaded. All output is local JSON under `backend/migration/`.", "");
  L.push("## Extraction method", "", EXTRACTION_METHOD, "");
  L.push("## URLs", "");
  L.push(table(["Metric", "Count"], [
    ["Discovered", report.urls.totalDiscovered],
    ["Fetched", report.urls.fetched],
    ["Fetched successfully", report.urls.fetchedSuccessfully],
    ["Failed (HTTP error / network)", report.urls.failed],
    ["Not fetched (skipped)", report.urls.skipped],
  ]));
  L.push("", "### By category", "", table(["Category", "URLs"], Object.entries(report.urls.byCategory)));
  L.push("", "### Skipped", "", table(["Reason", "URLs"], Object.entries(report.urls.skippedReasons)));
  if (report.urls.discoveredOnlyViaLinks.length) L.push("", "### Found only through internal links (not in any sitemap)", "", ...report.urls.discoveredOnlyViaLinks.map((u) => `- ${u}`));
  L.push("", "## Content found", "");
  L.push(table(["Type", "Count (excluding skipped)"], [
    ["Tours (incl. offers)", counts.tours],
    ["… of which /offers/ pages", counts.tourOffers],
    ["Destinations", counts.destinations],
    ["Excursions (transfer-rate pages)", counts.excursions],
    ["Vehicles / drivers", counts.vehicles],
    ["Blog posts", counts.blogPosts],
    ["Gallery items", counts.galleryItems],
    ["Reviews", counts.reviews],
    ["FAQ items", counts.faqs],
    ["Pages", counts.pages],
    ["Page-section candidates", counts.pageSectionCandidates],
    ["Tour categories", counts.tourCategories],
    ["Header menu items", counts.navigationItems],
    ["Media URLs (unique)", counts.mediaAssets],
    ["Media originals worth importing", counts.mediaForImport],
  ]));
  L.push("", "### Normalized datasets", "");
  L.push(table(["Dataset", "Records", "import", "review", "skip", "quality ok", "partial", "failed"], Object.entries(report.datasets).map(([k, s]) => [k, s.total, s.import, s.review, s.skip, s.qualityOk, s.qualityPartial, s.qualityFailed])));
  L.push("", "## Failed URLs / HTTP errors", "", table(["URL", "Status", "Error", "Found via"], httpErrors.map((e) => [e.url, e.status ?? "–", e.error ?? "", e.discoveredVia.slice(0, 2).join(", ")])));
  L.push("", "## Parsing errors", "", table(["URL", "Errors"], parsingErrors.map((p) => [p.url, p.errors.join("; ")])));
  L.push("", "## Missing important fields", "");
  for (const [ds, fields] of Object.entries(missing)) {
    L.push(`**${ds}**`, "", table(["Field", "Records missing it", "Examples"], Object.entries(fields as Record<string, string[]>).map(([f, srcs]) => [f, srcs.length, srcs.slice(0, 3).map((s) => s.replace(OLD_SITE.origin, "")).join(", ")])), "");
  }
  L.push("## Duplicates & conflicts", "");
  L.push("### Duplicate slugs", "", table(["Model", "Slug", "Sources"], conflicts.duplicateSlugs.map((d) => [d.model, d.slug, d.sources.join(", ")])));
  L.push("", "### Duplicate titles", "", table(["Model", "Title", "Sources"], conflicts.duplicateTitles.map((d) => [d.model, d.title, d.sources.join(", ")])));
  L.push("", "### Identical content", "", table(["Model", "Field", "Sources"], conflicts.identicalContent.map((d) => [d.model, d.field, d.sources.join(", ")])));
  L.push("", "### Shared boilerplate text", "", table(["Model", "Field", "Records", "Sample"], conflicts.sharedBoilerplate.map((d) => [d.model, d.field, d.count, d.sample])));
  L.push("", "### Invalid CMS slugs", "", table(["Model", "Slug", "Source"], conflicts.invalidSlugs.map((d) => [d.model, d.slug ?? "(none)", d.source])));
  L.push("", "### Collisions with the seeded CMS content (`src/scripts/seed-data.ts`, not the live database)", "", table(["Model", "Kind", "Migrated", "Seeded", "Source"], conflicts.seedCollisions.map((d) => [d.model, d.kind, d.migratedSlug, `${d.seedName} (${d.seedSlug})`, d.source])));
  L.push("", "### URL aliases (redirects / canonicals)", "", table(["URL", "Resolves to", "Reason"], conflicts.urlAliases.map((a) => [a.url, a.resolvesTo, a.reason])));
  L.push("", "### Broken internal links", "", table(["URL", "Status", "Linked from"], conflicts.brokenInternalLinks.map((b) => [b.url, b.status ?? b.error, b.linkedFrom.slice(0, 3).join(", ")])));
  L.push("", "### Duplicate media", "");
  L.push(`- ${mediaDup.sizeVariantGroups.length} images appear in several WordPress sizes (grouped under their original in \`normalized/media.json\`)`);
  L.push(`- ${mediaDup.urlAliases.length} media URL spellings collapsed by normalization (e.g. \`?ver=\` parameters)`);
  L.push(`- ${mediaDup.sameFilenameDifferentFolders.length} file names uploaded to more than one folder`);
  for (const d of mediaDup.sameFilenameDifferentFolders.slice(0, 15)) L.push(`  - ${d.filename}: ${d.originals.join(", ")}`);
  L.push("", "## Media", "", "```json", JSON.stringify(report.media, null, 2), "```");
  L.push("", "## Per-record review list", "");
  for (const [name, records] of Object.entries(datasets)) {
    if (!records.length) continue;
    L.push(`### ${name}`, "");
    L.push(
      table(
        ["Source", "Title", "Rec.", "Quality", "Missing", "Suspicious / duplicates"],
        records.map((r) => {
          const d = r.data as Record<string, unknown>;
          return [
            r.sourceUrl.replace(OLD_SITE.origin, ""),
            String(d.title ?? d.name ?? d.question ?? d.label ?? d.guestName ?? "").slice(0, 60),
            r.recommendation,
            r.quality.status,
            r.quality.missingFields.join(", "),
            [...r.quality.suspiciousFields.map((s) => `${s.field}: ${s.reason}`), ...r.quality.duplicateOf].join("; ").slice(0, 300),
          ];
        }),
      ),
      "",
    );
  }
  L.push("## Translations", "", "None extracted. The old site is English-only (`<html lang=\"en-US\">`, no hreflang alternates); the GTranslate plugin translates in the browser and stores nothing. English is the master content.", "");
  L.push("## Not migratable from the public site", "", "- Bookings and tailor-made enquiries (private customer data) – intentionally not scraped.", "- Contact-form submissions – not public.", "");
  L.push("## Output files", "", "- `raw/` – fetched HTML (`raw/html/`), sitemaps, WordPress API responses, per-type raw extraction JSON, `urls.json`, `media.json`", "- `normalized/` – one JSON file per CMS model; `data` holds only existing model fields, plus `references`, `unmapped`, `quality`, `recommendation`", "- `reports/` – this report, `discovery-report.json`, `conflicts.json`, `quality.json`, `url-map.json`, `business-data.md`", "");
  L.push("**Next phase (not started):** review this report and the normalized datasets, decide the open questions, then import. Nothing has been imported.", "");
  return `${L.join("\n")}\n`;
}

function renderBusiness(input: ReportInput): string {
  const b = input.business as Record<string, { value: unknown; sourceUrl: string; evidence: string }[]>;
  const site = input.datasets["site-settings"]?.[0];
  const L: string[] = ["# Business / contact data – MANUAL VERIFICATION REQUIRED", ""];
  L.push("Extracted from the public old website. Verify every value with the business owner before it is imported into Site Settings.", "");
  L.push("> Map embed URLs have their API key redacted. No secret values are included in this report.", "");
  if (site) {
    L.push("## Proposed Site Settings values", "", "```json", JSON.stringify(site.data, null, 2), "```", "");
    if (site.quality.suspiciousFields.length) L.push("### Warnings", "", ...site.quality.suspiciousFields.map((s) => `- **${s.field}:** ${s.reason}`), "");
  }
  for (const [field, items] of Object.entries(b)) {
    if (!Array.isArray(items) || !items.length) continue;
    L.push(`## ${field}`, "");
    if (field === "iconBoxes") {
      L.push(table(["Title", "Text"], (items as unknown as { title: string; text: string }[]).map((i) => [i.title, i.text])), "");
      continue;
    }
    const grouped = new Map<string, Set<string>>();
    for (const it of items) {
      const v = typeof it.value === "object" ? JSON.stringify(it.value) : String(it.value);
      (grouped.get(v) ?? grouped.set(v, new Set()).get(v)!).add(`${it.sourceUrl.replace(OLD_SITE.origin, "") || "/"} (${it.evidence})`);
    }
    L.push(table(["Value", "Pages", "Found on (evidence)"], [...grouped.entries()].map(([v, src]) => [v, src.size, [...src].slice(0, 4).join("; ") + (src.size > 4 ? " …" : "")])), "");
  }
  return `${L.join("\n")}\n`;
}
