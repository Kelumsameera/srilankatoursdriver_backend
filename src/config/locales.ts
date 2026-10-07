export const SOURCE_LOCALE = "en" as const;

export const SUPPORTED_LOCALES = [
  "en",
  "si",
  "ta",
  "de",
  "fr",
  "es",
  "it",
  "zh",
  "ja",
  "ko",
  "ru",
  "ar",
  "hi",
  "pt",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const TARGET_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== SOURCE_LOCALE);

export const LOCALE_META: Record<Locale, { name: string; nativeName: string; rtl?: boolean }> = {
  en: { name: "English", nativeName: "English" },
  si: { name: "Sinhala", nativeName: "සිංහල" },
  ta: { name: "Tamil", nativeName: "தமிழ்" },
  de: { name: "German", nativeName: "Deutsch" },
  fr: { name: "French", nativeName: "Français" },
  es: { name: "Spanish", nativeName: "Español" },
  it: { name: "Italian", nativeName: "Italiano" },
  zh: { name: "Chinese (Simplified)", nativeName: "简体中文" },
  ja: { name: "Japanese", nativeName: "日本語" },
  ko: { name: "Korean", nativeName: "한국어" },
  ru: { name: "Russian", nativeName: "Русский" },
  ar: { name: "Arabic", nativeName: "العربية", rtl: true },
  hi: { name: "Hindi", nativeName: "हिन्दी" },
  pt: { name: "Portuguese", nativeName: "Português" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
