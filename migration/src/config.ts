import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Discovery / extraction settings for the OLD WordPress website.
 * This tooling is READ-ONLY: it fetches public pages and writes local JSON files only.
 * It never imports mongoose, the Cloudinary SDK or any application service.
 */
export const OLD_SITE = {
  origin: "https://srilankatoursdriver.com",
  /** Hosts treated as the same website (www is folded into the apex host). */
  hosts: ["srilankatoursdriver.com", "www.srilankatoursdriver.com"],
  /** Suffix the old site appends to every <title>. */
  titleSuffix: / [-–|] Sri Lanka Tours Drivers?$/i,
} as const;

export const CRAWL = {
  userAgent: "SLTD-migration-discovery/1.0 (site owner content migration; read-only)",
  /** Minimum delay between two requests to the old site (ms). Raised if robots.txt sets Crawl-delay. */
  minDelayMs: 1000,
  timeoutMs: 30_000,
  retries: 3,
  maxRedirects: 5,
  /** Safety cap on HTML pages fetched in one run. */
  maxPages: 400,
} as const;

const here = path.dirname(fileURLToPath(import.meta.url));

/** backend/migration */
export const MIGRATION_ROOT = path.resolve(here, "..");

export const PATHS = {
  root: MIGRATION_ROOT,
  raw: path.join(MIGRATION_ROOT, "raw"),
  rawHtml: path.join(MIGRATION_ROOT, "raw", "html"),
  rawWpApi: path.join(MIGRATION_ROOT, "raw", "wp-api"),
  rawAssets: path.join(MIGRATION_ROOT, "raw", "assets"),
  normalized: path.join(MIGRATION_ROOT, "normalized"),
  reports: path.join(MIGRATION_ROOT, "reports"),
} as const;
