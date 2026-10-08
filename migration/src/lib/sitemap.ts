import * as cheerio from "cheerio";
import { cleanText } from "./text.js";
import { normalizeUrl } from "./url.js";

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  images: { loc: string; title: string | null; caption: string | null }[];
}

export interface ParsedSitemap {
  kind: "index" | "urlset" | "unknown";
  sitemaps: string[];
  urls: SitemapEntry[];
}

/** Parses a sitemap index or urlset (incl. image:image extensions). <loc> must be absolute – invalid locs are skipped. */
export function parseSitemap(xml: string, sitemapUrl: string): ParsedSitemap {
  const $ = cheerio.load(xml ?? "", { xml: true });
  if ($("sitemapindex").length) {
    const sitemaps = $("sitemapindex > sitemap > loc")
      .map((_, el) => normalizeUrl(cleanText($(el).text())))
      .get()
      .filter((u): u is string => Boolean(u));
    return { kind: "index", sitemaps: [...new Set(sitemaps)], urls: [] };
  }
  if ($("urlset").length) {
    const urls: SitemapEntry[] = [];
    $("urlset > url").each((_, el) => {
      const loc = normalizeUrl(cleanText($(el).children("loc").first().text()));
      if (!loc) return;
      const images = $(el)
        .find("image\\:image")
        .map((__, img) => ({
          loc: normalizeUrl(cleanText($(img).find("image\\:loc").text()), sitemapUrl) ?? "",
          title: cleanText($(img).find("image\\:title").text()) || null,
          caption: cleanText($(img).find("image\\:caption").text()) || null,
        }))
        .get()
        .filter((i) => i.loc);
      urls.push({ loc, lastmod: cleanText($(el).children("lastmod").first().text()) || null, images });
    });
    return { kind: "urlset", sitemaps: [], urls };
  }
  return { kind: "unknown", sitemaps: [], urls: [] };
}
