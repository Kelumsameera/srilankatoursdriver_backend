import crypto from "node:crypto";
import { OLD_SITE } from "../config.js";

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|msclkid|_ga|_gl|mc_cid|mc_eid|ver)$/i;
const ASSET_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|m4v|mp3|wav|pdf|docx?|xlsx?|zip|css|js|json|xml|txt|woff2?|ttf|eot|otf|map)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

const INTERNAL_HOSTS = new Set<string>(OLD_SITE.hosts);

function canonicalHost(host: string): string {
  const h = host.toLowerCase();
  return INTERNAL_HOSTS.has(h) ? h.replace(/^www\./, "") : h;
}

/**
 * Normalizes a URL so the same resource always has one spelling:
 * - resolves relative URLs against `base`
 * - lowercases the host, folds www. into the apex host and forces https for the old site
 * - removes fragments, default ports and tracking parameters (utm_*, fbclid, ?ver= …)
 * - sorts the remaining query parameters
 * - collapses duplicate slashes and adds the WordPress trailing slash to internal page paths
 * Returns null for non-http(s) links (mailto:, tel:, javascript:, data: …) and unparsable input.
 */
export function normalizeUrl(input: string | null | undefined, base?: string): string | null {
  if (!input) return null;
  const raw = input.trim().replace(/&amp;/g, "&");
  if (!raw || raw.startsWith("#")) return null;
  if (/^(mailto|tel|sms|javascript|data|blob|about|whatsapp|callto|skype):/i.test(raw)) return null;
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  u.hostname = canonicalHost(u.hostname);
  const internal = INTERNAL_HOSTS.has(u.hostname);
  if (internal) u.protocol = "https:";
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";

  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);

  let pathname = u.pathname.replace(/\/{2,}/g, "/");
  if (internal && !ASSET_EXT.test(pathname) && !pathname.endsWith("/") && !/\.[a-z0-9]{2,5}$/i.test(pathname)) pathname += "/";
  u.pathname = pathname;
  return u.toString();
}

export function isInternalUrl(url: string): boolean {
  try {
    return INTERNAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isAssetUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname;
    return ASSET_EXT.test(p) || /^\/wp-(content|includes)\//.test(p);
  } catch {
    return false;
  }
}

export function isImageUrl(url: string): boolean {
  try {
    return IMAGE_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isVideoUrl(url: string): boolean {
  try {
    return VIDEO_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Last non-empty path segment, decoded and lowercased. Null for the homepage or query-only URLs. */
export function slugFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const segments = u.pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  if (!last) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(last);
  } catch {
    slug = last;
  }
  slug = slug.toLowerCase().trim();
  return slug || null;
}

/** Path segments of a URL (no empty segments). */
export function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  } catch {
    return [];
  }
}

/** Site-relative path ("/to_book/x/") for an internal URL, otherwise the absolute URL. */
export function toSitePath(url: string): string {
  if (!isInternalUrl(url)) return url;
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/**
 * Deduplicates URLs by their normalized form, preserving first-seen order.
 * Returns the unique list plus every alias that collapsed onto an existing URL.
 */
export function dedupeUrls(urls: Iterable<string>, base?: string): { unique: string[]; duplicates: { url: string; normalized: string }[]; invalid: string[] } {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: { url: string; normalized: string }[] = [];
  const invalid: string[] = [];
  for (const url of urls) {
    const n = normalizeUrl(url, base);
    if (!n) {
      invalid.push(url);
      continue;
    }
    if (seen.has(n)) duplicates.push({ url, normalized: n });
    else {
      seen.add(n);
      unique.push(n);
    }
  }
  return { unique, duplicates, invalid };
}

/** Stable, filesystem-safe file key for a URL (same URL → same filename on every run). */
export function fileKeyForUrl(url: string): string {
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"));
  let key = segs.length ? segs.join("__") : "index";
  if (u.search) key += `__q-${crypto.createHash("sha1").update(u.search).digest("hex").slice(0, 10)}`;
  if (key.length > 150) key = `${key.slice(0, 130)}__${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}`;
  return key;
}

/** Removes API keys / tokens from a URL before it is written to a report (e.g. Google Maps embed ?key=). */
export function redactUrlSecrets(url: string): string {
  try {
    const u = new URL(url);
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (/^(key|api_?key|token|access_token|client_secret|password|secret)$/i.test(k)) {
        u.searchParams.set(k, "REDACTED");
        changed = true;
      }
    }
    return changed ? u.toString().replace(/REDACTED/g, "<redacted>") : url;
  } catch {
    return url;
  }
}
