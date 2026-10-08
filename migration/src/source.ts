import fs from "node:fs";
import path from "node:path";
import { CRAWL, PATHS } from "./config.js";
import { PoliteFetcher } from "./lib/fetcher.js";
import { readJson, relPath, writeJson, writeText } from "./lib/io.js";
import type { RobotsRules } from "./lib/robots.js";
import { fileKeyForUrl } from "./lib/url.js";
import type { FetchResult } from "./types.js";

export type ResourceKind = "html" | "xml" | "json" | "text" | "css";

interface IndexEntry {
  url: string;
  kind: ResourceKind;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  redirects: string[];
  attempts: number;
  error: string | null;
  file: string | null;
  fetchedAt: string;
}

const INDEX_FILE = path.join(PATHS.raw, "fetch-index.json");

const DIR_FOR: Record<ResourceKind, { dir: string; ext: string }> = {
  html: { dir: PATHS.rawHtml, ext: ".html" },
  xml: { dir: path.join(PATHS.raw, "sitemaps"), ext: ".xml" },
  json: { dir: PATHS.rawWpApi, ext: ".json" },
  text: { dir: PATHS.raw, ext: ".txt" },
  css: { dir: PATHS.rawAssets, ext: ".css" },
};

export function cacheFileFor(url: string, kind: ResourceKind): string {
  return path.join(DIR_FOR[kind].dir, `${fileKeyForUrl(url)}${DIR_FOR[kind].ext}`);
}

/**
 * Where page bodies come from.
 * - online: polite HTTP GETs to the old site; every response is cached under migration/raw/
 * - offline: replays the cache only (no network) – used to re-run extraction/normalization
 */
export class PageSource {
  private readonly index: Record<string, IndexEntry>;
  readonly fetcher: PoliteFetcher | null;

  constructor(
    readonly offline: boolean,
    opts: { minDelayMs?: number; log?: (m: string) => void } = {},
  ) {
    this.index = readJson<Record<string, IndexEntry>>(INDEX_FILE, {});
    this.fetcher = offline
      ? null
      : new PoliteFetcher({
          userAgent: CRAWL.userAgent,
          minDelayMs: opts.minDelayMs ?? CRAWL.minDelayMs,
          timeoutMs: CRAWL.timeoutMs,
          retries: CRAWL.retries,
          maxRedirects: CRAWL.maxRedirects,
          log: opts.log,
        });
  }

  setRobots(rules: RobotsRules | null): void {
    this.fetcher?.setRobots(rules);
  }

  isAllowed(url: string): boolean {
    return this.fetcher ? this.fetcher.isAllowed(url) : true;
  }

  fetchedAt(url: string): string | null {
    return this.index[url]?.fetchedAt ?? null;
  }

  async get(url: string, kind: ResourceKind): Promise<FetchResult> {
    if (this.offline) return this.fromCache(url, kind);
    const accept = kind === "json" ? "application/json" : kind === "xml" ? "application/xml,text/xml" : kind === "css" ? "text/css" : undefined;
    const res = await this.fetcher!.get(url, accept);
    const file = res.body !== null ? cacheFileFor(url, kind) : null;
    if (file) writeText(file, res.body!);
    this.index[url] = {
      url,
      kind,
      finalUrl: res.finalUrl,
      status: res.status,
      contentType: res.contentType,
      redirects: res.redirects,
      attempts: res.attempts,
      error: res.error,
      file: file ? relPath(PATHS.root, file) : null,
      fetchedAt: new Date().toISOString(),
    };
    return res;
  }

  private fromCache(url: string, kind: ResourceKind): FetchResult {
    const e = this.index[url];
    const base: FetchResult = { requestedUrl: url, finalUrl: url, status: null, contentType: null, body: null, redirects: [], attempts: 0, error: "not in offline cache", fromCache: true };
    if (!e) return base;
    const file = e.file ? path.join(PATHS.root, e.file) : cacheFileFor(url, kind);
    const body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    return { ...base, finalUrl: e.finalUrl, status: e.status, contentType: e.contentType, body, redirects: e.redirects, attempts: e.attempts, error: e.error ?? (body === null && e.status === 200 ? "cached body missing" : null) };
  }

  saveIndex(): void {
    const sorted = Object.fromEntries(Object.entries(this.index).sort(([a], [b]) => a.localeCompare(b)));
    writeJson(INDEX_FILE, sorted);
  }

  get stats() {
    return this.fetcher?.stats ?? { requests: 0, retries: 0, failures: 0, blockedByRobots: 0 };
  }
}
