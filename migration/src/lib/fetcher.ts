import type { FetchResult } from "../types.js";
import { isAllowedByRobots, type RobotsRules } from "./robots.js";
import { isInternalUrl, normalizeUrl } from "./url.js";

export interface FetcherOptions {
  userAgent: string;
  minDelayMs: number;
  timeoutMs: number;
  retries: number;
  maxRedirects: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GET-only HTTP client for the old website:
 * - one request at a time with a minimum delay between requests (robots Crawl-delay respected)
 * - robots.txt Disallow rules enforced before every request
 * - per-request timeout, retries with backoff for network errors / 429 / 5xx (Retry-After honoured)
 * - redirects followed manually and only within the old site's hosts (never crawls external sites)
 * Failures never throw: they are returned as a FetchResult with `error` set so they can be reported.
 */
export class PoliteFetcher {
  private robots: RobotsRules | null = null;
  private lastRequestAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  readonly stats = { requests: 0, retries: 0, failures: 0, blockedByRobots: 0 };

  constructor(private readonly opts: FetcherOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  setRobots(rules: RobotsRules | null): void {
    this.robots = rules;
  }

  isAllowed(url: string): boolean {
    return !this.robots || isAllowedByRobots(this.robots, url);
  }

  private get delayMs(): number {
    const robotsDelay = (this.robots?.crawlDelaySec ?? 0) * 1000;
    return Math.max(this.opts.minDelayMs, Math.min(robotsDelay, 30_000));
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.delayMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
  }

  async get(url: string, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"): Promise<FetchResult> {
    const result: FetchResult = { requestedUrl: url, finalUrl: url, status: null, contentType: null, body: null, redirects: [], attempts: 0, error: null, fromCache: false };
    let current = url;
    for (let hop = 0; hop <= this.opts.maxRedirects; hop += 1) {
      if (!isInternalUrl(current)) {
        result.error = `redirect to external host refused: ${new URL(current).host}`;
        this.stats.failures += 1;
        return result;
      }
      if (!this.isAllowed(current)) {
        result.error = "blocked by robots.txt";
        this.stats.blockedByRobots += 1;
        return result;
      }
      const res = await this.requestWithRetry(current, accept, result);
      if (!res) {
        this.stats.failures += 1;
        return result;
      }
      result.status = res.status;
      result.finalUrl = current;
      result.contentType = res.headers.get("content-type");
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = normalizeUrl(res.headers.get("location"), current);
        await res.body?.cancel().catch(() => undefined);
        if (!next) {
          result.error = `invalid redirect location: ${res.headers.get("location")}`;
          return result;
        }
        result.redirects.push(next);
        if (next === current) {
          result.error = "redirect loop";
          return result;
        }
        current = next;
        continue;
      }
      try {
        result.body = await res.text();
      } catch (err) {
        result.error = `failed to read body: ${(err as Error).message}`;
        this.stats.failures += 1;
        return result;
      }
      if (res.status >= 400) {
        result.error = `HTTP ${res.status}`;
        this.stats.failures += 1;
      }
      return result;
    }
    result.error = `too many redirects (> ${this.opts.maxRedirects})`;
    this.stats.failures += 1;
    return result;
  }

  private async requestWithRetry(url: string, accept: string, result: FetchResult): Promise<Response | null> {
    let lastError = "";
    for (let attempt = 1; attempt <= this.opts.retries + 1; attempt += 1) {
      await this.throttle();
      result.attempts += 1;
      this.stats.requests += 1;
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": this.opts.userAgent, accept, "accept-language": "en" },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt > this.opts.retries) return res;
        lastError = `HTTP ${res.status}`;
        const retryAfter = Number(res.headers.get("retry-after"));
        await res.body?.cancel().catch(() => undefined);
        this.stats.retries += 1;
        this.opts.log?.(`  retry ${attempt}/${this.opts.retries} ${url} (${lastError})`);
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2000 * attempt);
      } catch (err) {
        const e = err as Error;
        lastError = e.name === "TimeoutError" || e.name === "AbortError" ? `timeout after ${this.opts.timeoutMs}ms` : `network error: ${e.message}`;
        if (attempt > this.opts.retries) break;
        this.stats.retries += 1;
        this.opts.log?.(`  retry ${attempt}/${this.opts.retries} ${url} (${lastError})`);
        await this.sleep(2000 * attempt);
      }
    }
    result.error = lastError || "request failed";
    return null;
  }
}
