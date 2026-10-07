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

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(502, `Translation provider error (${res.status}): ${text.slice(0, 200)}`, [], "TRANSLATION_ERROR");
  }
  return (await res.json()) as T;
}

const DEEPL_CODES: Record<string, string> = { zh: "ZH-HANS", pt: "PT-PT", en: "EN-GB" };

const deepl: TranslationProvider = {
  name: "deepl",
  async translate(texts, target, source = "en") {
    const key = env.TRANSLATION_API_KEY!;
    const base = env.TRANSLATION_API_URL ?? (key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com");
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

const google: TranslationProvider = {
  name: "google",
  async translate(texts, target, source = "en") {
    const url = `${env.TRANSLATION_API_URL ?? "https://translation.googleapis.com"}/language/translate/v2?key=${encodeURIComponent(
      env.TRANSLATION_API_KEY!,
    )}`;
    return inChunks(texts, async (chunk) => {
      const data = await postJson<{ data: { translations: { translatedText: string }[] } }>(url, {
        q: chunk,
        target: GOOGLE_CODES[target] ?? target,
        source,
        format: "text",
      });
      return data.data.translations.map((t) => t.translatedText);
    });
  },
};

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
