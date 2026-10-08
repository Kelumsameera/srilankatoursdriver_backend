/**
 * Duplicate / conflict detection over the normalized datasets.
 * Compares against the LOCAL seed definitions (src/scripts/seed-data.ts – a pure data module with no imports),
 * NOT against MongoDB: this phase never connects to any database.
 */
import { CATEGORIES, CUSTOM_PAGES, DESTINATIONS, EXCURSIONS, FAQS, SYSTEM_PAGES, TOURS, VEHICLES } from "../../src/scripts/seed-data.js";
import { cmsSlugify, isValidCmsSlug } from "./normalize.js";
import { comparableText, sha256 } from "./lib/text.js";
import type { DiscoveredUrl, NormalizedRecord, RawPage } from "./types.js";

export interface ConflictReport {
  duplicateSlugs: { model: string; slug: string; sources: string[] }[];
  duplicateTitles: { model: string; title: string; sources: string[] }[];
  identicalContent: { model: string; field: string; sources: string[] }[];
  sharedBoilerplate: { model: string; field: string; count: number; sample: string; sources: string[] }[];
  invalidSlugs: { model: string; slug: string | null; source: string }[];
  seedCollisions: { model: string; kind: "same-slug" | "similar-name"; migratedSlug: string; seedSlug: string; seedName: string; source: string }[];
  urlAliases: { url: string; resolvesTo: string; reason: string }[];
  brokenInternalLinks: { url: string; status: number | null; error: string | null; linkedFrom: string[] }[];
}

function titleOf(r: NormalizedRecord): string {
  const d = r.data as Record<string, unknown>;
  return String(d.title ?? d.name ?? d.question ?? d.label ?? d.guestName ?? "");
}

const SEED_BY_MODEL: Record<string, { slug: string; name: string }[]> = {
  Destination: DESTINATIONS.map((d) => ({ slug: cmsSlugify(d.name), name: d.name })),
  Excursion: EXCURSIONS.map((e) => ({ slug: cmsSlugify(e.title), name: e.title })),
  Vehicle: VEHICLES.map((v) => ({ slug: cmsSlugify(v.name), name: v.name })),
  Tour: TOURS.map((t) => ({ slug: cmsSlugify(t.title), name: t.title })),
  Page: [...SYSTEM_PAGES.map((p) => ({ slug: p.slug, name: p.title })), ...CUSTOM_PAGES.map((p) => ({ slug: p.slug, name: p.title }))],
  FAQ: FAQS.map((f) => ({ slug: cmsSlugify(f.question).slice(0, 60), name: f.question })),
  Category: CATEGORIES.map((c) => ({ slug: `${c.kind}:${cmsSlugify(c.name)}`, name: `${c.name} (${c.kind})` })),
};

function similarNames(a: string, b: string): boolean {
  const x = comparableText(a);
  const y = comparableText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  return short.length >= 4 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(long);
}

function groupBy<T>(items: T[], key: (t: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const list = m.get(k) ?? [];
    list.push(it);
    m.set(k, list);
  }
  return m;
}

/** Detects conflicts and marks `quality.duplicateOf` on the affected records (in place). */
export function detectConflicts(datasets: Record<string, NormalizedRecord[]>, urls: DiscoveredUrl[], pages: RawPage[]): ConflictReport {
  const report: ConflictReport = { duplicateSlugs: [], duplicateTitles: [], identicalContent: [], sharedBoilerplate: [], invalidSlugs: [], seedCollisions: [], urlAliases: [], brokenInternalLinks: [] };

  const byModel = groupBy(Object.values(datasets).flat(), (r) => r.targetModel);
  for (const [model, records] of byModel) {
    const candidates = records.filter((r) => r.recommendation !== "skip");
    const hasSlug = candidates.some((r) => "slug" in r.data);
    if (hasSlug) {
      for (const r of candidates) {
        const slug = (r.data as Record<string, unknown>).slug as string | null;
        if (model === "Category") continue;
        if (!isValidCmsSlug(slug)) report.invalidSlugs.push({ model, slug, source: r.sourceUrl });
      }
      for (const [slug, list] of groupBy(candidates, (r) => ((r.data as Record<string, unknown>).slug as string) ?? null)) {
        if (list.length < 2) continue;
        report.duplicateSlugs.push({ model, slug, sources: list.map((r) => r.sourceUrl) });
        for (const r of list) r.quality.duplicateOf.push(...list.filter((o) => o !== r).map((o) => `slug "${slug}" also used by ${o.sourceUrl}`));
      }
    }
    if (model !== "NavigationItem" && model !== "PageSection" && model !== "Review") {
      for (const [, list] of groupBy(candidates, (r) => comparableText(titleOf(r)) || null)) {
        if (list.length < 2) continue;
        report.duplicateTitles.push({ model, title: titleOf(list[0]), sources: list.map((r) => r.sourceUrl) });
        for (const r of list) r.quality.duplicateOf.push(...list.filter((o) => o !== r).map((o) => `same title as ${o.sourceUrl}`));
      }
    }
    for (const field of ["description", "content", "answer", "review"]) {
      const groups = groupBy(candidates, (r) => {
        const v = (r.data as Record<string, unknown>)[field];
        return typeof v === "string" && v.length > 80 ? sha256(comparableText(v)) : null;
      });
      for (const [, list] of groups) {
        if (list.length < 2) continue;
        report.identicalContent.push({ model, field, sources: list.map((r) => r.sourceUrl) });
        for (const r of list) r.quality.duplicateOf.push(...list.filter((o) => o !== r).map((o) => `identical ${field} to ${o.sourceUrl}`));
      }
    }
    for (const field of ["shortDescription", "seo.metaDescription"]) {
      const get = (r: NormalizedRecord) => {
        const d = r.data as Record<string, unknown>;
        const v = field === "seo.metaDescription" ? (d.seo as Record<string, unknown> | undefined)?.metaDescription : d[field];
        return typeof v === "string" && v.length > 30 ? comparableText(v).slice(0, 120) : null;
      };
      for (const [, list] of groupBy(candidates, get)) {
        if (list.length < 3) continue;
        const d = list[0].data as Record<string, unknown>;
        const sample = String(field === "seo.metaDescription" ? (d.seo as Record<string, unknown>).metaDescription : d[field]).slice(0, 160);
        report.sharedBoilerplate.push({ model, field, count: list.length, sample, sources: list.map((r) => r.sourceUrl) });
        for (const r of list) r.quality.suspiciousFields.push({ field, reason: `same boilerplate text as ${list.length - 1} other ${model} record(s) – rewrite for SEO` });
      }
    }
    const seed = SEED_BY_MODEL[model];
    if (seed) {
      for (const r of candidates) {
        const d = r.data as Record<string, unknown>;
        const slug = model === "Category" ? `${d.kind}:${d.slug}` : String(d.slug ?? (model === "FAQ" ? cmsSlugify(String(d.question)).slice(0, 60) : ""));
        const name = titleOf(r);
        for (const s of seed) {
          if (s.slug === slug) report.seedCollisions.push({ model, kind: "same-slug", migratedSlug: slug, seedSlug: s.slug, seedName: s.name, source: r.sourceUrl });
          else if (model !== "Page" && similarNames(name, s.name)) report.seedCollisions.push({ model, kind: "similar-name", migratedSlug: slug, seedSlug: s.slug, seedName: s.name, source: r.sourceUrl });
        }
      }
    }
  }

  for (const u of urls) {
    if (u.finalUrl && u.finalUrl !== u.url) report.urlAliases.push({ url: u.url, resolvesTo: u.finalUrl, reason: "HTTP redirect" });
  }
  for (const p of pages) {
    const canonical = p.generic?.seo.canonical;
    if (canonical && canonical !== p.sourceUrl && canonical !== p.finalUrl) report.urlAliases.push({ url: p.sourceUrl, resolvesTo: canonical, reason: "rel=canonical points elsewhere" });
  }
  const linkedFrom = new Map<string, Set<string>>();
  for (const p of pages) for (const l of p.generic?.links.internal ?? []) (linkedFrom.get(l.href) ?? linkedFrom.set(l.href, new Set()).get(l.href)!).add(p.sourceUrl);
  for (const u of urls) {
    if (u.fetched && (u.error || (u.httpStatus ?? 0) >= 400)) report.brokenInternalLinks.push({ url: u.url, status: u.httpStatus, error: u.error, linkedFrom: [...(linkedFrom.get(u.url) ?? [])].sort() });
  }
  for (const r of Object.values(datasets).flat()) r.quality.duplicateOf = [...new Set(r.quality.duplicateOf)];
  return report;
}
