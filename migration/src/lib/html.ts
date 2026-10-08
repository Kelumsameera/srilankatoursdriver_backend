import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { cleanText, decodeCfEmail } from "./text.js";
import { isImageUrl, isInternalUrl, isVideoUrl, normalizeUrl } from "./url.js";

/**
 * Parses HTML into a static DOM. Cheerio never executes scripts, loads sub-resources or
 * evaluates inline handlers, so untrusted markup from the old site is inert here.
 */
export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html ?? "");
}

export function getBodyClasses($: CheerioAPI): string[] {
  return ($("body").attr("class") ?? "").split(/\s+/).filter(Boolean);
}

/** WordPress post/page ID from body classes (postid-123 / page-id-123). */
export function getWpPostId($: CheerioAPI): number | null {
  for (const c of getBodyClasses($)) {
    const m = /^(?:postid|page-id)-(\d+)$/.exec(c);
    if (m) return Number(m[1]);
  }
  return null;
}

/** WordPress post type from body classes (single-to_book → to_book, page → page). */
export function getWpPostType($: CheerioAPI): string | null {
  const classes = getBodyClasses($);
  const single = classes.find((c) => c.startsWith("single-") && c !== "single-format-standard");
  if (single) return single.slice("single-".length);
  if (classes.includes("page")) return "page";
  if (classes.includes("home")) return "home";
  if (classes.includes("archive")) return "archive";
  return null;
}

/**
 * Replaces Cloudflare-obfuscated e-mail addresses ("[email protected]") with the real address,
 * in place. Returns the decoded addresses.
 */
export function decodeCloudflareEmails($: CheerioAPI): string[] {
  const found: string[] = [];
  $("[data-cfemail]").each((_, el) => {
    const email = decodeCfEmail($(el).attr("data-cfemail"));
    if (email) {
      found.push(email);
      $(el).replaceWith(email);
    }
  });
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const hex = ($(el).attr("href") ?? "").split("#")[1];
    const email = decodeCfEmail(hex);
    if (email) {
      found.push(email);
      $(el).attr("href", `mailto:${email}`);
      if (/email.*protected/i.test($(el).text())) $(el).text(email);
    }
  });
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
    if (/^\[?email.*protected\]?$/i.test(cleanText($(el).text()))) found.push("<undecodable cloudflare email>");
  });
  return [...new Set(found)];
}

export interface SeoData {
  title: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  robots: string | null;
  canonical: string | null;
  htmlLang: string | null;
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  article: Record<string, string>;
  verification: Record<string, string>;
  structuredData: unknown[];
  structuredDataTypes: string[];
  structuredDataErrors: string[];
}

export function extractSeo($: CheerioAPI, pageUrl: string): SeoData {
  const meta = (sel: string) => cleanText($(sel).first().attr("content")) || null;
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr("property")!.slice(3);
    const v = cleanText($(el).attr("content"));
    if (v && !(k in og)) og[k] = v;
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr("name")!.slice(8);
    const v = cleanText($(el).attr("content"));
    if (v && !(k in twitter)) twitter[k] = v;
  });
  const article: Record<string, string> = {};
  $('meta[property^="article:"]').each((_, el) => {
    const k = $(el).attr("property")!.slice(8);
    const v = cleanText($(el).attr("content"));
    if (v && !(k in article)) article[k] = v;
  });
  const verification: Record<string, string> = {};
  $('meta[name*="verification"], meta[name="msvalidate.01"], meta[name="p:domain_verify"]').each((_, el) => {
    verification[$(el).attr("name")!] = cleanText($(el).attr("content"));
  });
  const structuredData: unknown[] = [];
  const structuredDataTypes: string[] = [];
  const structuredDataErrors: string[] = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    const raw = $(el).html() ?? "";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      structuredData.push(parsed);
      const graph = Array.isArray(parsed["@graph"]) ? (parsed["@graph"] as Record<string, unknown>[]) : [parsed];
      for (const node of graph) {
        const t = node?.["@type"];
        for (const type of Array.isArray(t) ? t : [t]) if (typeof type === "string") structuredDataTypes.push(type);
      }
    } catch (err) {
      structuredDataErrors.push(`ld+json #${i}: ${(err as Error).message}`);
    }
  });
  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  return {
    title: cleanText($("head > title").first().text() || $("title").first().text()) || null,
    metaDescription: meta('meta[name="description"]'),
    metaKeywords: meta('meta[name="keywords"]'),
    robots: meta('meta[name="robots"]'),
    canonical: canonicalHref ? normalizeUrl(canonicalHref, pageUrl) : null,
    htmlLang: $("html").attr("lang") ?? null,
    hreflang: $("link[hreflang]")
      .map((_, el) => ({ lang: $(el).attr("hreflang") ?? "", href: normalizeUrl($(el).attr("href"), pageUrl) ?? "" }))
      .get()
      .filter((h) => h.lang && h.href),
    og,
    twitter,
    article,
    verification,
    structuredData,
    structuredDataTypes: [...new Set(structuredDataTypes)],
    structuredDataErrors,
  };
}

/** Elements that are never page content (site chrome, forms, scripts, widgets). */
const NON_CONTENT =
  'script, style, noscript, template, svg, [data-elementor-type="header"], [data-elementor-type="footer"], [data-elementor-type="popup"], ' +
  "body > header, body > footer, #masthead, #colophon, aside, #secondary, .widget-area, .comments-area, #comments, .post-navigation, " +
  "form, .wpcf7, .forminator-ui, .wpforms-container, .elementor-widget-form, .elementor-widget-babe-booking-form, .elementor-widget-babe-search-form, " +
  ".elementor-widget-triply-nav-menu, .elementor-widget-nav-menu, nav, .screen-reader-text, .elementor-widget-babe-item-related, .elementor-widget-babe-item-other, " +
  'iframe[src*="currencyrate"], .sltd-currency-converter, .currency-converter';

/** A detached copy of the main content area with site chrome removed. */
export function contentRoot($: CheerioAPI): Cheerio<Element> {
  let root = $("#content").first();
  if (!root.length) root = $("main").first();
  if (!root.length) root = $("body").first();
  const copy = root.clone();
  copy.find(NON_CONTENT).remove();
  return copy as Cheerio<Element>;
}

export function textOf($: CheerioAPI, el: Cheerio<AnyNode>): string {
  // Insert spaces at block boundaries so adjacent blocks do not glue words together.
  const copy = el.clone();
  copy.find("br").replaceWith(" ");
  copy.find("p, li, h1, h2, h3, h4, h5, h6, div, td, th, tr").each((_, n) => {
    $(n).append(" ");
  });
  return cleanText(copy.text());
}

export interface Heading {
  level: number;
  text: string;
}

export function extractHeadings($: CheerioAPI, root: Cheerio<AnyNode>): Heading[] {
  const out: Heading[] = [];
  root.find("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = cleanText($(el).text());
    if (text) out.push({ level: Number(el.tagName.slice(1)), text });
  });
  return out;
}

export function extractParagraphs($: CheerioAPI, root: Cheerio<AnyNode>): string[] {
  const out: string[] = [];
  root.find("p").each((_, el) => {
    const text = cleanText($(el).text());
    if (text && !out.includes(text)) out.push(text);
  });
  return out;
}

export interface LinkRef {
  href: string;
  text: string;
}

export function extractLinks($: CheerioAPI, pageUrl: string, scope?: Cheerio<AnyNode>): { internal: LinkRef[]; external: LinkRef[]; special: LinkRef[] } {
  const internal = new Map<string, LinkRef>();
  const external = new Map<string, LinkRef>();
  const special = new Map<string, LinkRef>();
  (scope ? scope.find("a[href]") : $("a[href]")).each((_, el) => {
    const raw = ($(el).attr("href") ?? "").trim();
    const text = cleanText($(el).text()) || cleanText($(el).attr("aria-label")) || cleanText($(el).attr("title"));
    if (/^(mailto|tel|sms|whatsapp):/i.test(raw)) {
      if (!special.has(raw)) special.set(raw, { href: raw, text });
      return;
    }
    const n = normalizeUrl(raw, pageUrl);
    if (!n) return;
    const target = isInternalUrl(n) ? internal : external;
    if (!target.has(n)) target.set(n, { href: n, text });
  });
  return { internal: [...internal.values()], external: [...external.values()], special: [...special.values()] };
}

export interface ImageRef {
  url: string;
  /** Other renditions of the same image: largest srcset candidate, lightbox link target. */
  alternates: string[];
  alt: string | null;
  title: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  context: string;
}

function pickFromSrcset(srcset: string | undefined, pageUrl: string): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [u, size] = part.trim().split(/\s+/);
    const w = size?.endsWith("w") ? Number(size.slice(0, -1)) : size?.endsWith("x") ? Number(size.slice(0, -1)) * 1000 : 0;
    const n = normalizeUrl(u, pageUrl);
    if (n && (!best || w > best.w)) best = { url: n, w };
  }
  return best?.url ?? null;
}

const PLACEHOLDER_IMG = /(data:image|\/placeholder\.(png|svg|gif)|blank\.gif|spacer\.gif|lazy[-_]?load|1x1\.)/i;

/** Drops generated alt texts ("Gallery Thumbnail 0", "image", file names) that describe nothing. */
export function meaningfulAlt(alt: string | undefined | null): string | null {
  const t = cleanText(alt);
  if (!t) return null;
  if (/^(gallery )?(thumbnail|image|photo|picture|img)( \d+)?$/i.test(t)) return null;
  if (/\.(jpe?g|png|webp|gif)$/i.test(t)) return null;
  return t;
}

function intAttr(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** All images in a scope, resolving lazy-load attributes and srcsets (largest candidate wins). */
export function extractImages($: CheerioAPI, pageUrl: string, scope: Cheerio<AnyNode>, context = "content"): ImageRef[] {
  const out: ImageRef[] = [];
  scope.find("img").each((_, el) => {
    const img = $(el);
    const candidates = [
      img.attr("data-orig-file"),
      img.attr("data-large-file"),
      img.attr("data-src"),
      img.attr("data-lazy-src"),
      pickFromSrcset(img.attr("data-srcset") ?? img.attr("data-lazy-srcset"), pageUrl) ?? undefined,
      img.attr("src"),
    ].filter((c): c is string => Boolean(c) && !PLACEHOLDER_IMG.test(c!));
    const srcsetBest = pickFromSrcset(img.attr("srcset"), pageUrl);
    const primary = normalizeUrl(candidates[0] ?? srcsetBest ?? undefined, pageUrl);
    if (!primary) return;
    const link = img.closest("a").attr("href");
    const linkedUrl = link ? normalizeUrl(link, pageUrl) : null;
    const caption =
      cleanText(img.closest("figure").find("figcaption").first().text()) ||
      cleanText(img.closest(".wp-caption, .gallery-item, .elementor-image").find(".wp-caption-text, .gallery-caption, .widget-image-caption").first().text()) ||
      null;
    const alternates = [srcsetBest, linkedUrl && (isImageUrl(linkedUrl) || isVideoUrl(linkedUrl)) ? linkedUrl : null].filter(
      (u): u is string => Boolean(u) && u !== primary,
    );
    out.push({
      url: primary,
      alternates: [...new Set(alternates)],
      alt: meaningfulAlt(img.attr("alt")),
      title: cleanText(img.attr("title")) || null,
      caption,
      width: intAttr(img.attr("width")),
      height: intAttr(img.attr("height")),
      context,
    });
  });
  return out;
}

/** Background images from inline styles and Elementor data-settings JSON. */
export function extractBackgroundImages($: CheerioAPI, pageUrl: string, scope: Cheerio<AnyNode>): string[] {
  const urls = new Set<string>();
  scope.find("[style*='background']").each((_, el) => {
    for (const m of ($(el).attr("style") ?? "").matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      const n = normalizeUrl(m[2], pageUrl);
      if (n && isImageUrl(n)) urls.add(n);
    }
  });
  scope.find("[data-settings]").each((_, el) => {
    const raw = $(el).attr("data-settings");
    if (!raw || !raw.includes("url")) return;
    try {
      collectUrls(JSON.parse(raw), pageUrl, urls);
    } catch {
      /* not JSON – ignore */
    }
  });
  return [...urls];
}

function collectUrls(value: unknown, pageUrl: string, into: Set<string>): void {
  if (typeof value === "string") {
    const n = normalizeUrl(value, pageUrl);
    if (n && isImageUrl(n)) into.add(n);
  } else if (Array.isArray(value)) value.forEach((v) => collectUrls(v, pageUrl, into));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectUrls(v, pageUrl, into));
}

export interface VideoRef {
  url: string;
  provider: "youtube" | "vimeo" | "instagram" | "tiktok" | "file" | "other";
  context: string;
}

export function extractVideos($: CheerioAPI, pageUrl: string, scope: Cheerio<AnyNode>, context = "content"): VideoRef[] {
  const out = new Map<string, VideoRef>();
  const add = (raw: string | undefined) => {
    const n = normalizeUrl(raw, pageUrl);
    if (!n) return;
    const provider = /youtube\.com|youtu\.be/.test(n) ? "youtube" : /vimeo\.com/.test(n) ? "vimeo" : /instagram\.com\/(reel|tv)\//.test(n) ? "instagram" : /tiktok\.com/.test(n) ? "tiktok" : isVideoUrl(n) ? "file" : null;
    if (provider && !out.has(n)) out.set(n, { url: n, provider, context });
  };
  scope.find("iframe").each((_, el) => add($(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src")));
  scope.find("video, video source").each((_, el) => add($(el).attr("src") ?? $(el).attr("data-src")));
  scope.find("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/youtube\.com\/(watch|shorts|embed)|youtu\.be\/|vimeo\.com\/\d|tiktok\.com\/@[^/]+\/video|instagram\.com\/reel\//.test(href) || isVideoUrl(href.split("?")[0])) add(href);
  });
  scope.find("[data-settings]").each((_, el) => {
    const raw = $(el).attr("data-settings") ?? "";
    for (const m of raw.matchAll(/(?:youtube_url|vimeo_url|hosted_url|background_video_link)&quot;:&quot;([^&]+)|(?:youtube_url|vimeo_url|background_video_link)":"([^"]+)/g)) add((m[1] ?? m[2]).replace(/\\\//g, "/"));
  });
  return [...out.values()];
}

/* ───────────── HTML → Markdown (the CMS renders descriptions with react-markdown + GFM) ───────────── */

/** Placeholder for <br>: becomes a GFM hard line break (backslash + newline) unless it ends a block. */
const BR = "%%BR%%";
const BLOCK_TAGS = new Set(["p", "div", "section", "article", "header", "footer", "main", "figure", "figcaption", "address", "dl", "dd", "dt", "center"]);
const DROP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "iframe", "form", "button", "input", "select", "textarea", "label", "img", "video", "audio", "picture", "source", "object", "embed", "canvas"]);

function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function inlineMd(nodes: AnyNode[], baseUrl: string): string {
  return nodes.map((n) => nodeMd(n, baseUrl, 0)).join("");
}

function listMd(el: Element, baseUrl: string, depth: number): string {
  const ordered = el.tagName === "ol";
  let i = 0;
  const lines: string[] = [];
  for (const child of el.children) {
    if (!isElement(child) || child.tagName !== "li") continue;
    i += 1;
    const nested: string[] = [];
    const inline: AnyNode[] = [];
    for (const c of child.children) {
      if (isElement(c) && (c.tagName === "ul" || c.tagName === "ol")) nested.push(listMd(c, baseUrl, depth + 1));
      else inline.push(c);
    }
    const text = collapse(inlineMd(inline, baseUrl).replace(/\n+/g, " "));
    if (!text && !nested.length) continue;
    lines.push(`${"  ".repeat(depth)}${ordered ? `${i}.` : "-"} ${text}`);
    lines.push(...nested.filter(Boolean));
  }
  return lines.join("\n");
}

function tableMd(el: Element, baseUrl: string): string {
  const $ = cheerio.load("");
  const rows: string[][] = [];
  $(el)
    .find("tr")
    .each((_, tr) => {
      const cells = $(tr)
        .children("th, td")
        .map((__, td) => collapse(inlineMd((td as Element).children, baseUrl).replace(/\n+/g, " ")).replace(/\|/g, "\\|"))
        .get();
      if (cells.some(Boolean)) rows.push(cells);
    });
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const [head, ...body] = rows;
  return [`| ${pad(head).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...body.map((r) => `| ${pad(r).join(" | ")} |`)].join("\n");
}

function collapse(s: string): string {
  return s.replace(/[ \t\u00a0]+/g, " ").trim();
}

function nodeMd(node: AnyNode, baseUrl: string, depth: number): string {
  if (node.type === "text") return escapeInline((node as unknown as { data: string }).data.replace(/\s+/g, " "));
  if (!isElement(node)) return "";
  const tag = node.tagName.toLowerCase();
  if (DROP_TAGS.has(tag)) return "";
  const kids = () => node.children.map((c) => nodeMd(c, baseUrl, depth)).join("");
  switch (tag) {
    case "br":
      return `${BR}\n`;
    case "hr":
      return "\n\n---\n\n";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const t = collapse(kids().replace(/\n+/g, " "));
      return t ? `\n\n${"#".repeat(Math.max(2, Number(tag[1])))} ${t}\n\n` : "";
    }
    case "strong":
    case "b": {
      const t = collapse(kids());
      return t ? `**${t}**` : "";
    }
    case "em":
    case "i": {
      const t = collapse(kids());
      return t ? `*${t}*` : "";
    }
    case "a": {
      const t = collapse(kids());
      const href = node.attribs.href?.trim();
      if (!t) return "";
      if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return t;
      const abs = /^(mailto|tel):/i.test(href) ? href : normalizeUrl(href, baseUrl);
      return abs ? `[${t}](${abs})` : t;
    }
    case "ul":
    case "ol":
      return `\n\n${listMd(node, baseUrl, 0)}\n\n`;
    case "table":
      return `\n\n${tableMd(node, baseUrl)}\n\n`;
    case "blockquote": {
      const t = collapse(kids());
      return t ? `\n\n${t.split("\n").map((l) => `> ${l}`).join("\n")}\n\n` : "";
    }
    default:
      if (BLOCK_TAGS.has(tag)) {
        const t = kids();
        return t.trim() ? `\n\n${t}\n\n` : "";
      }
      return kids();
  }
}

/** Converts an HTML fragment to GitHub-flavoured Markdown. Images are omitted (tracked as media). */
export function htmlToMarkdown(html: string | null | undefined, baseUrl: string): string {
  if (!html) return "";
  const $ = cheerio.load(`<div id="__md_root">${html}</div>`);
  const root = $("#__md_root").get(0) as Element | undefined;
  if (!root) return "";
  const out = root.children
    .map((c) => nodeMd(c, baseUrl, 0))
    .join("")
    // Adjacent <strong> runs ("**a****b**") would break emphasis – merge them.
    .replace(/\*\*\*\*/g, "")
    .replace(/\*\*(\s*)\*\*/g, "$1")
    .replace(/%%BR%%\n(?=[ \t]*(\n|$))/g, "\n")
    .replace(/%%BR%%\n/g, "\\\n")
    .replace(/%%BR%%/g, "");
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+(?![-\d])/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
