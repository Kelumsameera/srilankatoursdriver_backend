/**
 * URL safety helpers shared by Zod schemas and Mongoose models.
 *
 * Links stored in the CMS end up in `href`/`src` attributes on the public site, so anything that
 * could execute script (javascript:, vbscript:, data:) or silently leave the site
 * (protocol-relative "//evil.com", "/\evil.com", credentials tricks) is rejected.
 */

// Control characters, whitespace and backslashes have no place in a stored URL. Browsers strip or
// normalise them ("java\tscript:", "/\evil.com"), which is how filters get bypassed.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F\\]/;
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\x00-\x20\x7F-\x9F\\]/;

/** Special link value: CMS buttons may use "whatsapp" to open a chat with the number from Site Settings. */
export const SPECIAL_LINKS = ["whatsapp"];

function parseAbsolute(value: string): URL | null {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Absolute http(s) URL with a real host and no embedded credentials. */
export function isHttpUrl(value: string): boolean {
  if (!value || value.length > 2048 || UNSAFE_CHARS.test(value)) return false;
  const url = parseAbsolute(value);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return false;
  if (!url.hostname || url.username || url.password) return false;
  // Require a dotted public-looking host, or localhost for development.
  return url.hostname === "localhost" || /^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/i.test(url.hostname) || /^\[[0-9a-f:.]+\]$/i.test(url.hostname);
}

/**
 * Safe link target for buttons, menus and footer links:
 * - site-relative paths ("/tours", "/en/contact?x=1#top") – but never "//host" or "/\host"
 * - in-page anchors ("#faq")
 * - absolute http(s) URLs
 * - mailto: and tel: links
 * - the special value "whatsapp" (see SPECIAL_LINKS)
 */
export function isSafeHref(value: string): boolean {
  if (!value || value.length > 2048 || CONTROL_CHARS.test(value)) return false;
  // Phone links are commonly written with spaces ("tel:+94 76 930 0334"); nothing else may contain them.
  if (/^tel:/i.test(value)) return /^tel:\+?[0-9().\- ]{3,30}$/i.test(value);
  if (UNSAFE_CHARS.test(value)) return false;
  if (SPECIAL_LINKS.includes(value)) return true;
  if (value.startsWith("#")) return value.length > 1;
  // "//evil.com" is protocol-relative (leaves the site); backslashes were rejected above.
  if (value.startsWith("/")) return !value.startsWith("//");
  if (/^mailto:/i.test(value)) return /^mailto:[^\s@<>"]+@[^\s@<>"]+$/i.test(value.split("?")[0]);
  return isHttpUrl(value);
}

/** Hosts accepted for guest-short links on each social platform. */
export const PLATFORM_HOSTS: Record<string, RegExp> = {
  youtube: /^(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
  instagram: /^(www\.)?instagram\.com$/i,
  tiktok: /^((www|m|vm|vt)\.)?tiktok\.com$/i,
};

export function isPlatformUrl(platform: string, value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const hostRule = PLATFORM_HOSTS[platform];
  if (!hostRule) return false;
  const url = new URL(value);
  return url.protocol === "https:" && hostRule.test(url.hostname);
}

/** Google Maps / OpenStreetMap embeds only – this URL is rendered inside an <iframe>. */
export function isMapEmbedUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (/^(www\.|maps\.)?google\.[a-z.]{2,6}$/i.test(url.hostname) || /^(www\.)?openstreetmap\.org$/i.test(url.hostname))
  );
}
