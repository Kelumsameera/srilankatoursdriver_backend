import path from "node:path";
import type { MediaRecord, MediaRole, MediaUsage, PageCategory } from "../types.js";
import { isInternalUrl, normalizeUrl } from "./url.js";

const SIZE_SUFFIX = /-(\d{2,5})x(\d{2,5})(?=\.[a-z0-9]+$)/i;
const SCALED_SUFFIX = /-(scaled|rotated)(?=\.[a-z0-9]+$)/i;

/**
 * WordPress stores resized copies as name-1000x565.jpg (and big uploads as name-scaled.jpg).
 * Returns the presumed original upload URL plus the variant's dimensions.
 */
export function wpOriginalUrl(url: string): { originalUrl: string; isSizeVariant: boolean; width: number | null; height: number | null } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { originalUrl: url, isSizeVariant: false, width: null, height: null };
  }
  if (!/\/wp-content\/uploads\//.test(u.pathname)) return { originalUrl: url, isSizeVariant: false, width: null, height: null };
  const m = SIZE_SUFFIX.exec(u.pathname);
  let pathname = u.pathname;
  let width: number | null = null;
  let height: number | null = null;
  if (m) {
    width = Number(m[1]);
    height = Number(m[2]);
    pathname = pathname.replace(SIZE_SUFFIX, "");
  }
  const isSizeVariant = Boolean(m) || SCALED_SUFFIX.test(pathname);
  u.pathname = pathname;
  return { originalUrl: u.toString(), isSizeVariant, width, height };
}

export function mediaTypeFor(url: string): MediaRecord["mediaType"] {
  const p = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (/\.svg$/.test(p)) return "svg";
  if (/\.(jpe?g|png|gif|webp|avif|bmp|ico|tiff?)$/.test(p)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(p)) return "video";
  if (/\.(pdf|docx?|xlsx?)$/.test(p)) return "document";
  if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com\/(p|reel)\//.test(url)) return "embed";
  if (/cdninstagram\.com|fbcdn\.net/.test(url)) return "image";
  return "other";
}

/** Theme / plugin chrome that is not site content (star sprites, flags, logos of plugins …). */
export function isUiAsset(url: string): boolean {
  return /\/wp-content\/(plugins|themes)\/|\/wp-includes\/|\/(flags?|emoji)\/|gravatar\.com|s\.w\.org/i.test(url);
}

export interface AddMediaInput {
  url: string;
  sourcePage: string;
  pageCategory: PageCategory;
  role: MediaRole;
  altText?: string | null;
  caption?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Collects every media reference once (deduplicated by normalized URL) with all its usages. */
export class MediaCollector {
  private readonly records = new Map<string, MediaRecord>();
  /** Raw spellings that collapsed onto an existing record (for the duplicate-media report). */
  readonly aliases: { url: string; normalized: string; sourcePage: string }[] = [];

  add(input: AddMediaInput): MediaRecord | null {
    const url = normalizeUrl(input.url, input.sourcePage);
    if (!url) return null;
    if (url !== input.url && input.url.startsWith("http")) this.aliases.push({ url: input.url, normalized: url, sourcePage: input.sourcePage });
    const usage: MediaUsage = { sourcePage: input.sourcePage, pageCategory: input.pageCategory, role: input.role, altText: input.altText ?? null, caption: input.caption ?? null };
    const existing = this.records.get(url);
    if (existing) {
      if (!existing.usages.some((u) => u.sourcePage === usage.sourcePage && u.role === usage.role)) existing.usages.push(usage);
      if (!existing.sourcePages.includes(input.sourcePage)) existing.sourcePages.push(input.sourcePage);
      if (!existing.roles.includes(input.role)) existing.roles.push(input.role);
      if (!existing.usedFor.includes(input.pageCategory)) existing.usedFor.push(input.pageCategory);
      existing.altText ||= input.altText ?? null;
      existing.caption ||= input.caption ?? null;
      existing.title ||= input.title ?? null;
      if (!existing.width && input.width) {
        existing.width = input.width;
        existing.height = input.height ?? null;
        existing.dimensionsSource = "html-attributes";
      }
      this.applyExclusion(existing);
      return existing;
    }
    const variant = wpOriginalUrl(url);
    let filename: string | null;
    try {
      filename = decodeURIComponent(path.posix.basename(new URL(url).pathname)) || null;
    } catch {
      filename = null;
    }
    const record: MediaRecord = {
      sourceUrl: url,
      filename,
      extension: filename && filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : null,
      mediaType: mediaTypeFor(url),
      originalUrl: variant.originalUrl,
      isSizeVariant: variant.isSizeVariant,
      altText: input.altText ?? null,
      caption: input.caption ?? null,
      title: input.title ?? null,
      width: input.width ?? variant.width,
      height: input.height ?? variant.height,
      dimensionsSource: input.width ? "html-attributes" : variant.width ? "filename" : null,
      mimeType: null,
      wpMediaId: null,
      roles: [input.role],
      usedFor: [input.pageCategory],
      sourcePage: input.sourcePage,
      sourcePages: [input.sourcePage],
      usages: [usage],
      hostedExternally: !isInternalUrl(url),
      excludeFromImport: false,
      excludeReason: null,
    };
    this.applyExclusion(record);
    this.records.set(url, record);
    return record;
  }

  private applyExclusion(r: MediaRecord): void {
    const reasons: string[] = [];
    if (isUiAsset(r.sourceUrl)) reasons.push("theme/plugin UI asset");
    if (/default-avatar/i.test(r.sourceUrl)) reasons.push("generic default avatar");
    if (r.roles.length === 1 && r.roles[0] === "ui-asset") reasons.push("UI asset");
    if (/cdninstagram\.com|fbcdn\.net/.test(r.sourceUrl)) reasons.push("Instagram CDN URL (signed, expires) – re-source from the Instagram post");
    // Keep favicon / logos even though they are small: Brand Settings needs them.
    if (r.roles.includes("logo") || r.roles.includes("favicon")) reasons.length = 0;
    r.excludeFromImport = reasons.length > 0;
    r.excludeReason = reasons.length ? [...new Set(reasons)].join("; ") : null;
  }

  enrichFromWpMedia(items: { id: number; source_url?: string; alt_text?: string; caption?: { rendered?: string }; title?: { rendered?: string }; mime_type?: string; media_details?: { width?: number; height?: number; sizes?: Record<string, { source_url?: string }> } }[]): number {
    const byUrl = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const urls = [item.source_url, ...Object.values(item.media_details?.sizes ?? {}).map((s) => s.source_url)];
      for (const u of urls) {
        const n = normalizeUrl(u);
        if (n) byUrl.set(n, item);
      }
    }
    let matched = 0;
    for (const r of this.records.values()) {
      const item = byUrl.get(r.sourceUrl) ?? byUrl.get(r.originalUrl);
      if (!item) continue;
      matched += 1;
      r.wpMediaId = item.id;
      r.mimeType = item.mime_type ?? r.mimeType;
      r.altText ||= stripTags(item.alt_text) || null;
      r.caption ||= stripTags(item.caption?.rendered) || null;
      r.title ||= stripTags(item.title?.rendered) || null;
      const isOriginal = normalizeUrl(item.source_url) === r.sourceUrl;
      if (isOriginal && item.media_details?.width) {
        r.width = item.media_details.width;
        r.height = item.media_details.height ?? null;
        r.dimensionsSource = "wp-api";
      }
    }
    return matched;
  }

  list(): MediaRecord[] {
    return [...this.records.values()].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  }

  get size(): number {
    return this.records.size;
  }

  /** Size variants grouped by original upload + identical filenames stored in different folders. */
  duplicateReport() {
    const variants = new Map<string, string[]>();
    const byFilename = new Map<string, Set<string>>();
    for (const r of this.records.values()) {
      if (r.hostedExternally || r.excludeFromImport) continue;
      const list = variants.get(r.originalUrl) ?? [];
      list.push(r.sourceUrl);
      variants.set(r.originalUrl, list);
      const base = path.posix.basename(r.originalUrl).toLowerCase();
      const set = byFilename.get(base) ?? new Set<string>();
      set.add(r.originalUrl);
      byFilename.set(base, set);
    }
    return {
      sizeVariantGroups: [...variants.entries()].filter(([, urls]) => urls.length > 1).map(([originalUrl, urls]) => ({ originalUrl, urls: urls.sort() })),
      sameFilenameDifferentFolders: [...byFilename.entries()].filter(([, s]) => s.size > 1).map(([filename, s]) => ({ filename, originals: [...s].sort() })),
      urlAliases: this.aliases,
    };
  }
}

function stripTags(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
