import https from "node:https";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";

export interface TranslationProvider {
  name: string;
  translate(texts: string[], target: string, source?: string): Promise<string[]>;
}

const CHUNK = 40;

async function inChunks(texts: string[], fn: (chunk: string[]) => Promise<string[]>): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += CHUNK) out.push(...(await fn(texts.slice(i, i + CHUNK))));
  return out;
}

const RETRY_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 4;

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    // Providers rate-limit bursts (bulk translation); back off and retry, honouring Retry-After when given.
    if (!RETRY_STATUSES.has(res.status) || attempt >= MAX_ATTEMPTS) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, delay));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(502, `Translation provider error (${res.status}): ${text.slice(0, 200)}`, [], "TRANSLATION_ERROR");
  }
  return (await res.json()) as T;
}

const DEEPL_CODES: Record<string, string> = { zh: "ZH-HANS", pt: "PT-PT", en: "EN-GB" };
/** Site locales DeepL cannot translate into – routed to Google when GOOGLE_TRANSLATE_API_KEY is set. */
const DEEPL_UNSUPPORTED = new Set(["si"]);

/**
 * Resolves the DeepL API origin. Accepts a full endpoint URL (".../v2/translate") as well as a bare origin,
 * and routes free keys (":fx") to api-free.deepl.com, since the paid host rejects them.
 */
export function deeplBaseUrl(key: string, configured?: string): string {
  const isFree = key.endsWith(":fx");
  if (!configured) return isFree ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const base = configured.trim().replace(/\/+$/, "").replace(/\/v2(\/translate)?$/i, "");
  if (isFree && /^https:\/\/api\.deepl\.com$/i.test(base)) return "https://api-free.deepl.com";
  if (!isFree && /^https:\/\/api-free\.deepl\.com$/i.test(base)) return "https://api.deepl.com";
  return base;
}

const deepl: TranslationProvider = {
  name: "deepl",
  async translate(texts, target, source = "en") {
    if (DEEPL_UNSUPPORTED.has(target)) {
      // Languages DeepL lacks (Sinhala) go to Google Translate when a fallback key is configured.
      if (env.GOOGLE_TRANSLATE_API_KEY) return googleTranslate(texts, target, source, env.GOOGLE_TRANSLATE_API_KEY);
      throw new ApiError(
        422,
        `DeepL does not support this language (${target}). Set GOOGLE_TRANSLATE_API_KEY to translate it with Google, or translate it manually.`,
        [],
        "TRANSLATION_UNSUPPORTED",
      );
    }
    const key = env.TRANSLATION_API_KEY!;
    const base = deeplBaseUrl(key, env.TRANSLATION_API_URL);
    return inChunks(texts, async (chunk) => {
      const data = await postJson<{ translations: { text: string }[] }>(
        `${base}/v2/translate`,
        { text: chunk, target_lang: DEEPL_CODES[target] ?? target.toUpperCase(), source_lang: source.toUpperCase(), preserve_formatting: true },
        { authorization: `DeepL-Auth-Key ${key}` },
      );
      return data.translations.map((t) => t.text);
    });
  },
};

const GOOGLE_CODES: Record<string, string> = { zh: "zh-CN" };

function googleTranslate(texts: string[], target: string, source: string, key: string, baseUrl = "https://translation.googleapis.com") {
  const url = `${baseUrl}/language/translate/v2?key=${encodeURIComponent(key)}`;
  return inChunks(texts, async (chunk) => {
    const data = await postJson<{ data: { translations: { translatedText: string }[] } }>(url, {
      q: chunk,
      target: GOOGLE_CODES[target] ?? target,
      source,
      format: "text",
    });
    return data.data.translations.map((t) => t.translatedText);
  });
}

const google: TranslationProvider = {
  name: "google",
  translate: (texts, target, source = "en") => googleTranslate(texts, target, source, env.TRANSLATION_API_KEY!, env.TRANSLATION_API_URL),
};

/** Locales always translated with the free, keyless Google endpoint (bypasses the configured provider). */
export const FREE_GOOGLE_LOCALES = new Set(["si"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST via node:https – Google answers Node's built-in fetch (undici) on this endpoint with 429 only. */
function httpsPostForm(url: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "content-length": Buffer.byteLength(body) }, timeout: 30_000 },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Free Google Translate timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

/**
 * Free, keyless Google Translate (the unofficial web endpoint used by browser extensions).
 * No SLA: Google may rate-limit or block bulk use, so strings are sent one at a time with a one-second
 * pause, 429/503 are retried with back-off, and text goes in a POST body (long Markdown fits).
 */
export const googleFree: TranslationProvider = {
  name: "google-free",
  async translate(texts, target, source = "en") {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(GOOGLE_CODES[target] ?? target)}`;
    const out: string[] = [];
    for (const text of texts) {
      if (!text.trim()) {
        out.push(text);
        continue;
      }
      let res: { status: number; text: string };
      for (let attempt = 1; ; attempt++) {
        res = await httpsPostForm(url, new URLSearchParams({ q: text }).toString());
        if (!RETRY_STATUSES.has(res.status) || attempt >= MAX_ATTEMPTS) break;
        await sleep(1500 * 2 ** attempt);
      }
      if (res.status === 302) {
        // Google redirects to its "unusual traffic" captcha page once it throttles this IP (usually lifts within hours).
        throw new ApiError(429, "Free Google Translate is temporarily blocking this server (too many requests). Try again in a few hours or set GOOGLE_TRANSLATE_API_KEY.", [], "TRANSLATION_RATE_LIMITED");
      }
      if (res.status !== 200) throw new ApiError(502, `Free Google Translate error (${res.status})`, [], "TRANSLATION_ERROR");
      // Response: [[["translated segment", "source segment", …], …], …]
      const data = JSON.parse(res.text) as [[string, string][] | null];
      const translated = (data?.[0] ?? []).map((seg) => seg?.[0] ?? "").join("");
      out.push(translated || text);
      await sleep(1000); // stay well below Google's throttling threshold
    }
    return out;
  },
};

/** Provider for one locale: free Google for FREE_GOOGLE_LOCALES, otherwise the configured provider. */
export function getProviderForLocale(locale: string): TranslationProvider {
  if (!override && FREE_GOOGLE_LOCALES.has(locale)) return googleFree;
  return getTranslationProvider();
}

const libre: TranslationProvider = {
  name: "libretranslate",
  async translate(texts, target, source = "en") {
    const base = env.TRANSLATION_API_URL ?? "https://libretranslate.com";
    return inChunks(texts, async (chunk) => {
      const data = await postJson<{ translatedText: string[] | string }>(`${base}/translate`, {
        q: chunk,
        source,
        target: target === "zh" ? "zh-Hans" : target,
        format: "text",
        ...(env.TRANSLATION_API_KEY ? { api_key: env.TRANSLATION_API_KEY } : {}),
      });
      return Array.isArray(data.translatedText) ? data.translatedText : [data.translatedText];
    });
  },
};

export function isTranslationConfigured(): boolean {
  if (env.TRANSLATION_PROVIDER === "none") return false;
  if (env.TRANSLATION_PROVIDER === "libretranslate") return Boolean(env.TRANSLATION_API_URL || env.TRANSLATION_API_KEY);
  return Boolean(env.TRANSLATION_API_KEY);
}

let override: TranslationProvider | null = null;
/** Test hook – lets tests inject a fake provider. */
export function setTranslationProvider(p: TranslationProvider | null) {
  override = p;
}

export function getTranslationProvider(): TranslationProvider {
  if (override) return override;
  if (!isTranslationConfigured()) {
    throw ApiError.unavailable(
      "Machine translation is not configured. Set TRANSLATION_PROVIDER and TRANSLATION_API_KEY on the backend, or edit translations manually.",
    );
  }
  switch (env.TRANSLATION_PROVIDER) {
    case "deepl":
      return deepl;
    case "google":
      return google;
    case "libretranslate":
      return libre;
    default:
      throw ApiError.unavailable("Unknown translation provider");
  }
}
