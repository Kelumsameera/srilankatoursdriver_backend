import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import {
  contentRoot,
  decodeCloudflareEmails,
  extractBackgroundImages,
  extractHeadings,
  extractImages,
  extractLinks,
  extractParagraphs,
  extractSeo,
  extractVideos,
  getBodyClasses,
  getWpPostId,
  getWpPostType,
  htmlToMarkdown,
  textOf,
  type Heading,
  type ImageRef,
  type LinkRef,
  type SeoData,
  type VideoRef,
} from "./lib/html.js";
import {
  cleanText,
  normalizePhone,
  parseAllPrices,
  parseDate,
  parseDayNumber,
  parseDuration,
  parseFirstInt,
  parsePrice,
  splitList,
  stripTitleSuffix,
  type ParsedDuration,
  type ParsedPrice,
} from "./lib/text.js";
import { normalizeUrl, redactUrlSecrets } from "./lib/url.js";

/* ───────────── Generic page ───────────── */

export interface GenericExtraction {
  title: string | null;
  pageTitle: string | null;
  h1: string[];
  headings: Heading[];
  paragraphs: string[];
  extractedText: string;
  contentMarkdown: string;
  seo: SeoData;
  wpPostId: number | null;
  wpPostType: string | null;
  bodyClasses: string[];
  links: { internal: LinkRef[]; external: LinkRef[]; special: LinkRef[] };
  /** Internal links inside the main content only (no header/footer/menus) – used for listing membership. */
  contentLinks: string[];
  images: ImageRef[];
  backgroundImages: string[];
  videos: VideoRef[];
  decodedEmails: string[];
  elementorCss: string[];
}

/** Must run first: decodes Cloudflare-protected e-mails in place so every later extractor sees them. */
export function extractGeneric($: CheerioAPI, url: string): GenericExtraction {
  const decodedEmails = decodeCloudflareEmails($);
  const root = contentRoot($);
  const seo = extractSeo($, url);
  const h1 = root
    .find("h1")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);
  const pageTitle = stripTitleSuffix(seo.title);
  return {
    title: h1[0] ?? pageTitle,
    pageTitle,
    h1: [...new Set(h1)],
    headings: extractHeadings($, root),
    paragraphs: extractParagraphs($, root),
    extractedText: textOf($, root),
    contentMarkdown: htmlToMarkdown(root.html(), url),
    seo,
    wpPostId: getWpPostId($),
    wpPostType: getWpPostType($),
    bodyClasses: getBodyClasses($),
    links: extractLinks($, url),
    contentLinks: extractLinks($, url, root).internal.map((l) => l.href),
    images: extractImages($, url, root),
    backgroundImages: extractBackgroundImages($, url, $("body")),
    videos: extractVideos($, url, root),
    decodedEmails,
    elementorCss: $('link[id^="elementor-post-"]')
      .map((_, el) => normalizeUrl($(el).attr("href"), url))
      .get()
      .filter((u): u is string => Boolean(u)),
  };
}

/** background-image URLs declared in an Elementor per-post CSS file. */
export function extractCssBackgrounds(css: string, cssUrl: string): { selector: string; url: string }[] {
  const out: { selector: string; url: string }[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/background(?:-image)?\s*:[^;]*url\((['"]?)([^'")]+)\1\)/g)) {
      const n = normalizeUrl(m[2], cssUrl);
      if (n && /\.(jpe?g|png|webp|gif|avif)$/i.test(new URL(n).pathname)) out.push({ selector: cleanText(rule[1]).slice(0, 200), url: n });
    }
  }
  return out;
}

/* ───────────── BA Book Everything items (/to_book/ tours + driver/vehicle listings) ───────────── */

export interface ItineraryStep {
  title: string;
  dayNumber: number | null;
  text: string;
  markdown: string;
  paragraphs: string[];
  listItems: string[];
  overnight: string | null;
}

export interface BookingItemExtraction {
  title: string | null;
  priceFrom: (ParsedPrice & { label: string | null }) | null;
  duration: ParsedDuration | null;
  durationRaw: string | null;
  maxGuests: number | null;
  minAge: number | null;
  tourType: string | null;
  address: string | null;
  ratingSummary: string | null;
  contentMarkdown: string;
  contentText: string;
  contentParagraphs: string[];
  included: string[];
  excluded: string[];
  inclusionListsUnclassified: string[][];
  steps: ItineraryStep[];
  otherSteps: ItineraryStep[];
  galleryImages: ImageRef[];
  bookingForm: { present: boolean; fields: string[] };
  facts: Record<string, string>;
  pricesInContent: ParsedPrice[];
  destinationsMentioned: string[];
  emails: string[];
  phones: string[];
}

function widget($: CheerioAPI, name: string): Cheerio<Element> {
  return $(`.elementor-widget-${name}`);
}

/** Text of a widget without its "Price" / "Duration" section title. */
function widgetValue($: CheerioAPI, name: string): string | null {
  const w = widget($, name).first();
  if (!w.length) return null;
  const copy = w.clone();
  copy.find(".babe-section-title, .elementor-heading-title, script, style").remove();
  return cleanText(copy.text()) || null;
}

/** "Label : value" lines from Markdown text (e.g. "Type of Vehicle : Toyota Prius"). */
export function extractLabeledFacts(markdown: string): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const rawLine of markdown.split("\n")) {
    const line = cleanText(rawLine.replace(/[*_`>#]|\\/g, "").replace(/^[-\d.]+\s+/, ""));
    const m = /^([A-Za-z][A-Za-z()' /-]{2,40}?)\s*:\s*(.{1,200})$/.exec(line);
    if (!m) continue;
    const key = cleanText(m[1]);
    if (/^(https?|mailto|tel|note|day \d+)$/i.test(key) || key.split(" ").length > 6) continue;
    if (!(key in facts)) facts[key] = cleanText(m[2]);
  }
  return facts;
}

function stepFrom($: CheerioAPI, step: Cheerio<AnyNode>, url: string): ItineraryStep {
  const title = cleanText(step.find(".step_title").first().text()) || cleanText(step.find(".block_step_title").first().text());
  const body = step.find(".block_step_content .content").first().length ? step.find(".block_step_content .content").first() : step.find(".block_step_content").first();
  const paragraphs = body
    .find("p")
    .map((_, p) => cleanText($(p).text()))
    .get()
    .filter(Boolean);
  const listItems = body
    .find("li")
    .map((_, li) => cleanText($(li).text()))
    .get()
    .filter(Boolean);
  const text = textOf($, body);
  const overnightRe = /^overnight (?:stay )?(?:at|in)\s+(.{2,60}?)\s*\.?$/i;
  const overnight =
    [...paragraphs, ...listItems].map((p) => overnightRe.exec(p)?.[1]?.trim()).find(Boolean) ??
    /overnight (?:stay )?(?:at|in)\s+([A-Z][\w .'’-]{1,60}?)(?:[.,;(]|$| hotel)/i.exec(text)?.[1]?.trim() ??
    null;
  return { title, dayNumber: parseDayNumber(title), text, markdown: htmlToMarkdown(body.html(), url), paragraphs, listItems, overnight };
}

export function extractBookingItem($: CheerioAPI, url: string): BookingItemExtraction {
  const content = widget($, "babe-item-content").first();
  const contentInner = content.find(".elementor-widget-container").first().length ? content.find(".elementor-widget-container").first() : content;
  const contentMarkdown = htmlToMarkdown(contentInner.html(), url);
  const contentText = textOf($, contentInner);

  const priceWidget = widget($, "babe-item-price-from").first();
  const amountEl = priceWidget.find("[data-amount]").first();
  let priceFrom: BookingItemExtraction["priceFrom"] = null;
  if (amountEl.length) {
    const amount = Number(amountEl.attr("data-amount"));
    const symbolPrice = parsePrice(cleanText(amountEl.text()));
    if (Number.isFinite(amount)) {
      priceFrom = {
        amount,
        currency: symbolPrice?.currency ?? null,
        raw: cleanText(amountEl.text()),
        label: cleanText(priceWidget.find("label").first().text()) || null,
      };
    }
  } else {
    const p = parsePrice(widgetValue($, "babe-item-price-from"));
    if (p) priceFrom = { ...p, label: null };
  }

  const durationRaw = cleanText(widget($, "babe-item-duration").find(".item-meta-value").first().text()) || widgetValue($, "babe-item-duration");

  const included: string[] = [];
  const excluded: string[] = [];
  const unclassified: string[][] = [];
  widget($, "babe-item-included").each((_, w) => {
    const items: { text: string; kind: "in" | "out" | null }[] = [];
    $(w)
      .find("li")
      .each((__, li) => {
        const text = cleanText($(li).find(".list-text").first().text() || $(li).text());
        const icon = $(li).find("i").attr("class") ?? "";
        const kind = /times|close|xmark|ban|minus/.test(icon) ? "out" : /check|tick|plus/.test(icon) ? "in" : null;
        if (text) items.push({ text, kind });
      });
    for (const it of items) {
      if (it.kind === "in") included.push(it.text);
      else if (it.kind === "out") excluded.push(it.text);
    }
    const unknown = items.filter((i) => i.kind === null).map((i) => i.text);
    if (unknown.length) unclassified.push(unknown);
  });

  const steps: ItineraryStep[] = [];
  const otherSteps: ItineraryStep[] = [];
  widget($, "babe-item-steps")
    .find(".block_step")
    .each((_, s) => {
      const step = stepFrom($, $(s), url);
      (step.dayNumber !== null ? steps : otherSteps).push(step);
    });

  const gallery = widget($, "babe-item-slideshow");
  const galleryImages = gallery.length ? extractImages($, url, gallery, "slideshow") : [];

  const form = widget($, "babe-booking-form");
  const fields = form
    .find("label, .booking-form-block-title, .booking_form_input_title, h4, .step-title, input[placeholder], select")
    .map((_, el) => cleanText($(el).text()) || cleanText($(el).attr("placeholder")) || cleanText($(el).attr("name")))
    .get()
    .filter((t) => t && t.length < 60);

  const facts = extractLabeledFacts(contentMarkdown);
  const covers = /\bcovers?\s+([^.]+?)\./i.exec(contentText)?.[1] ?? null;
  const emails = [...new Set((contentText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e) => e.replace(/\.$/, "").toLowerCase()))];
  const phones = [...new Set((contentText.match(/\(?\+\d{1,3}\)?[\d\s-]{7,16}\d/g) ?? []).map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p)))];
  const contentParagraphs = contentInner
    .find("p, li")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);

  return {
    title: cleanText($("h1").first().text()) || stripTitleSuffix($("title").text()),
    priceFrom,
    duration: parseDuration(durationRaw),
    durationRaw: durationRaw || null,
    maxGuests: parseFirstInt(widget($, "babe-item-max-guests").find(".item-meta-value").first().text() || widgetValue($, "babe-item-max-guests")),
    minAge: parseFirstInt(widget($, "babe-item-min-age").find(".item-meta-value").first().text() || widgetValue($, "babe-item-min-age")),
    tourType: widgetValue($, "babe-item-tour-type"),
    address: widgetValue($, "babe-item-address"),
    ratingSummary: widgetValue($, "babe-item-stars"),
    contentMarkdown,
    contentText,
    contentParagraphs,
    included,
    excluded,
    inclusionListsUnclassified: unclassified,
    steps,
    otherSteps,
    galleryImages,
    bookingForm: { present: form.length > 0, fields: [...new Set(fields)] },
    facts,
    pricesInContent: parseAllPrices(contentText),
    destinationsMentioned: covers ? splitList(covers).filter((s) => s.length < 40) : [],
    emails,
    phones,
  };
}

/* ───────────── Excursion pages (per-city transfer rate tables) ───────────── */

export interface TransferRate {
  from: string | null;
  destination: string | null;
  prices: Record<string, ParsedPrice | null>;
  estimatedDuration: string | null;
  durationHours: number | null;
  tollRoad: boolean;
  mileageKm: number | null;
  cells: string[];
}

export interface ExcursionExtraction {
  title: string | null;
  heroImage: ImageRef | null;
  images: ImageRef[];
  rateTableHeaders: string[];
  rates: TransferRate[];
  descriptionParagraphs: string[];
  transferFormPresent: boolean;
  transferFormTitle: string | null;
}

export function parseRateTable($: CheerioAPI, table: Cheerio<AnyNode>): { headers: string[]; rates: TransferRate[] } {
  const headers = table
    .find("thead th, tr:first-child th")
    .map((_, th) => cleanText($(th).text()))
    .get();
  const uniqueHeaders = [...new Set(headers)];
  const idx = (re: RegExp) => uniqueHeaders.findIndex((h) => re.test(h));
  const fromIdx = idx(/^from$/i);
  const destIdx = idx(/destination|^to$/i);
  const durIdx = idx(/duration|time/i);
  const kmIdx = idx(/mileage|km|distance/i);
  const priceCols = uniqueHeaders.map((h, i) => ({ h, i })).filter(({ i }) => ![fromIdx, destIdx, durIdx, kmIdx].includes(i));
  const rates: TransferRate[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr)
      .children("td")
      .map((__, td) => cleanText($(td).text()))
      .get();
    if (!cells.length || cells.every((c) => !c)) return;
    const durCell = durIdx >= 0 ? (cells[durIdx] ?? "") : "";
    const prices: Record<string, ParsedPrice | null> = {};
    for (const { h, i } of priceCols) prices[h] = parsePrice(cells[i]);
    rates.push({
      from: fromIdx >= 0 ? cells[fromIdx] || null : null,
      destination: destIdx >= 0 ? cells[destIdx] || null : null,
      prices,
      estimatedDuration: durCell ? cleanText(durCell.replace(/\(toll road\)/i, "")) || null : null,
      durationHours: parseDuration(durCell)?.hours ?? null,
      tollRoad: /toll/i.test(durCell),
      mileageKm: kmIdx >= 0 ? parseFirstInt(cells[kmIdx]) : null,
      cells,
    });
  });
  return { headers: uniqueHeaders, rates };
}

export function extractExcursion($: CheerioAPI, url: string): ExcursionExtraction {
  const root = contentRoot($);
  const table = $("#content table").first();
  const { headers, rates } = table.length ? parseRateTable($, table) : { headers: [], rates: [] };
  const images = extractImages($, url, root);
  const formTitle = cleanText($("#content form").closest("section, .e-con, div").find("h2, h3").first().text()) || cleanText($("#content h3").first().text()) || null;
  const descriptionParagraphs = root
    .find("p")
    .map((_, p) => cleanText($(p).text()))
    .get()
    .filter((t) => t && !/currency converter/i.test(t));
  return {
    title: cleanText(root.find("h1").first().text()) || stripTitleSuffix($("title").text()),
    heroImage: images[0] ?? null,
    images,
    rateTableHeaders: headers,
    rates,
    descriptionParagraphs,
    transferFormPresent: $("#content form").length > 0,
    transferFormTitle: formTitle,
  };
}

/* ───────────── Destination pages ───────────── */

export interface DestinationExtraction {
  name: string | null;
  paragraphs: string[];
  markdown: string;
  images: ImageRef[];
  attractions: string | null;
}

export function extractDestination($: CheerioAPI, url: string): DestinationExtraction {
  const root = contentRoot($);
  const name = cleanText(root.find("h1, h2").first().text()) || stripTitleSuffix($("title").text());
  const firstHeading = root.find("h1, h2").first();
  const body = root.clone();
  if (firstHeading.length) body.find("h1, h2").first().remove();
  const paragraphs = extractParagraphs($, root);
  return {
    name,
    paragraphs,
    markdown: htmlToMarkdown(body.html(), url),
    images: extractImages($, url, root),
    attractions: paragraphs.find((p) => /^main attractions?\b/i.test(p))?.replace(/^main attractions?\s*[:-]?\s*/i, "") ?? null,
  };
}

/* ───────────── FAQ accordions ───────────── */

export interface FaqExtraction {
  question: string;
  answerText: string;
  answerMarkdown: string;
  group: string | null;
  widget: string;
}

export function extractFaqs($: CheerioAPI, url: string): FaqExtraction[] {
  const out: FaqExtraction[] = [];
  const groupFor = (el: Cheerio<AnyNode>) => {
    const section = el.closest(".elementor-section, .e-con, .elementor-top-section");
    return cleanText(section.find(".elementor-heading-title").first().text()) || null;
  };
  $(".elementor-accordion-item, .elementor-toggle-item").each((_, item) => {
    const q = cleanText($(item).find(".elementor-tab-title").first().find(".elementor-accordion-title, .elementor-toggle-title, a").first().text() || $(item).find(".elementor-tab-title").first().text());
    const a = $(item).find(".elementor-tab-content").first();
    if (q) out.push({ question: q, answerText: textOf($, a), answerMarkdown: htmlToMarkdown(a.html(), url), group: groupFor($(item)), widget: "elementor-accordion" });
  });
  $("details.e-n-accordion-item").each((_, item) => {
    const q = cleanText($(item).find(".e-n-accordion-item-title-text").first().text() || $(item).children("summary").text());
    const a = $(item).children("[role=region], .e-con").first();
    if (q) out.push({ question: q, answerText: textOf($, a), answerMarkdown: htmlToMarkdown(a.html(), url), group: groupFor($(item)), widget: "elementor-nested-accordion" });
  });
  return out;
}

/* ───────────── TripAdvisor review slider (WP TripAdvisor Review Slider plugin) ───────────── */

export interface ReviewExtraction {
  guestName: string | null;
  rating: number | null;
  title: string | null;
  text: string;
  date: string | null;
  dateRaw: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  verified: boolean;
  platform: "tripadvisor";
  widgetId: string | null;
}

export function extractTripadvisorReviews($: CheerioAPI, url: string): ReviewExtraction[] {
  const out: ReviewExtraction[] = [];
  $("[id^='wprev-slider'] .w3_wprs-col, .wprev-no-slider .w3_wprs-col").each((_, col) => {
    const c = $(col);
    const p = c.find(".wprev_preview_tcolor1_T1, [class*='_P_3']").first().clone();
    const title = cleanText(p.find(".wprevrevtitle").text()) || null;
    const starSrc = p.find("img[src*='stars']").attr("src") ?? "";
    const rating = /stars?_(\d)(?:[._-]\d)?\.(png|svg)/i.exec(starSrc)?.[1];
    p.find(".wptripadvisor_star_imgs_T1, .wprevrevtitle, a.wprs_rd_more, img, .wprevpro_verified_svg").remove();
    const text = cleanText(p.text()).replace(/^[–-]\s*/, "");
    const meta = c.find("[class*='_SPAN_5'], .wprev_preview_tcolor2_T1").first().clone();
    const dateRaw = cleanText(meta.find("[class*='showdate']").text()) || null;
    meta.find("[class*='showdate']").remove();
    const avatar = c.find("img.wptripadvisor_t1_IMG_4, img[alt*='avatar']").attr("src");
    out.push({
      guestName: cleanText(meta.text()) || null,
      rating: rating ? Number(rating) : null,
      title,
      text,
      date: parseDate(dateRaw),
      dateRaw,
      avatarUrl: avatar ? normalizeUrl(avatar, url) : null,
      profileUrl: normalizeUrl(c.find("a[href*='tripadvisor']").attr("href"), url),
      verified: c.find("[data-wprevtooltip*='Verified']").length > 0,
      platform: "tripadvisor",
      widgetId: c.closest("[id^='wprev-slider']").attr("id") ?? null,
    });
  });
  return out.filter((r) => r.text || r.title);
}

/* ───────────── Instagram feed (Smash Balloon) + regular galleries ───────────── */

export interface InstagramItem {
  permalink: string | null;
  type: "image" | "video" | "carousel" | "unknown";
  caption: string | null;
  mediaUrl: string | null;
  postedAt: string | null;
}

export function extractInstagramFeed($: CheerioAPI, url: string): InstagramItem[] {
  return $(".sbi_item")
    .map((_, el) => {
      const item = $(el);
      const cls = item.attr("class") ?? "";
      const photo = item.find(".sbi_photo").first();
      let mediaUrl = normalizeUrl(photo.attr("data-full-res"), url);
      if (!mediaUrl) {
        try {
          const set = JSON.parse(photo.attr("data-img-src-set") ?? "{}") as Record<string, string>;
          mediaUrl = normalizeUrl(set.d ?? Object.values(set).pop(), url);
        } catch {
          mediaUrl = null;
        }
      }
      const ts = Number(item.attr("data-date"));
      return {
        permalink: normalizeUrl(item.find("a[href*='instagram.com']").first().attr("href"), url),
        type: /sbi_type_video/.test(cls) ? "video" : /sbi_type_carousel/.test(cls) ? "carousel" : /sbi_type_image/.test(cls) ? "image" : "unknown",
        caption: cleanText(item.find("img").first().attr("alt")) || cleanText(item.find(".sbi_caption").text()) || null,
        mediaUrl,
        postedAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : null,
      } satisfies InstagramItem;
    })
    .get();
}

export function extractGalleryImages($: CheerioAPI, url: string): ImageRef[] {
  const scope = $(".elementor-image-gallery, .elementor-gallery__container, .e-gallery-container, .gallery, .wp-block-gallery, .elementor-widget-image-carousel").filter(
    (_, el) => $(el).closest(".elementor-widget-babe-item-slideshow, .booking_single_gallery, [data-elementor-type='header'], [data-elementor-type='footer'], [data-elementor-type='popup']").length === 0,
  );
  return scope.length ? extractImages($, url, scope, "gallery") : [];
}

/* ───────────── Business / contact information ───────────── */

export interface Sourced<T> {
  value: T;
  sourceUrl: string;
  evidence: string;
}

export interface BusinessExtraction {
  siteName: Sourced<string>[];
  addresses: Sourced<string>[];
  phones: Sourced<string>[];
  whatsapp: Sourced<string>[];
  emails: Sourced<string>[];
  businessHours: Sourced<string>[];
  socials: Sourced<{ platform: string; url: string }>[];
  maps: Sourced<{ kind: "embed" | "link"; url: string; query: string | null }>[];
  iconBoxes: { title: string; text: string }[];
}

export function socialPlatform(url: string): string | null {
  let host: string;
  let pathname: string;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\.|^m\./, "");
    pathname = u.pathname;
  } catch {
    return null;
  }
  if (/sharer|share\.php|intent\/tweet|\/share\b/.test(url)) return null;
  if (host.endsWith("facebook.com")) return "facebook";
  if (host.endsWith("instagram.com")) return /^\/(p|reel|tv|stories)\//.test(pathname) ? null : "instagram";
  if (host.endsWith("youtube.com") || host === "youtu.be") return /^\/(channel|c|user|@)/.test(pathname) || pathname.startsWith("/@") ? "youtube" : null;
  if (host.endsWith("tiktok.com")) return /^\/@[^/]+\/?$/.test(pathname) ? "tiktok" : null;
  if (/tripadvisor\./.test(host)) return /Review|Profile/.test(pathname) ? "tripadvisor" : null;
  if (host === "twitter.com" || host === "x.com") return "twitter";
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host.endsWith("pinterest.com")) return "pinterest";
  return null;
}

export function extractBusinessInfo($: CheerioAPI, url: string): BusinessExtraction {
  const out: BusinessExtraction = { siteName: [], addresses: [], phones: [], whatsapp: [], emails: [], businessHours: [], socials: [], maps: [], iconBoxes: [] };
  const push = <T>(list: Sourced<T>[], value: T, evidence: string) => {
    const key = JSON.stringify(value);
    if (!list.some((s) => JSON.stringify(s.value) === key)) list.push({ value, sourceUrl: url, evidence });
  };
  const siteName = cleanText($('meta[property="og:site_name"]').attr("content"));
  if (siteName) push(out.siteName, siteName, "og:site_name");

  $(".elementor-icon-box-wrapper, .elementor-widget-icon-box").each((_, box) => {
    const title = cleanText($(box).find(".elementor-icon-box-title").first().text());
    const text = cleanText($(box).find(".elementor-icon-box-description").first().text());
    if (!title || !text) return;
    if (!out.iconBoxes.some((b) => b.title === title && b.text === text)) out.iconBoxes.push({ title, text });
    if (/address|location|office/i.test(title)) push(out.addresses, text, `icon box "${title}"`);
    else if (/whats\s*app/i.test(title)) push(out.whatsapp, normalizePhone(text) ?? text, `icon box "${title}": ${text}`);
    else if (/phone|call|mobile|hotline|tel/i.test(title)) push(out.phones, normalizePhone(text) ?? text, `icon box "${title}": ${text}`);
    else if (/e-?mail/i.test(title)) push(out.emails, text.toLowerCase(), `icon box "${title}"`);
    else if (/hour|open/i.test(title)) push(out.businessHours, text, `icon box "${title}"`);
  });

  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").trim();
    const text = cleanText($(a).text());
    if (/^tel:/i.test(href)) {
      const p = normalizePhone(href.slice(4));
      if (p) push(out.phones, p, `tel: link "${text}"`);
    } else if (/^mailto:/i.test(href)) {
      const e = href.slice(7).split("?")[0].toLowerCase();
      if (e.includes("@")) push(out.emails, e, `mailto: link`);
    } else if (/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(href)) {
      const digits = /wa\.me\/\+?(\d+)/i.exec(href)?.[1] ?? /phone=\+?(\d+)/i.exec(href)?.[1];
      if (digits) push(out.whatsapp, `+${digits}`, `WhatsApp link ${href.split("?")[0]}`);
    } else {
      const n = normalizeUrl(href, url);
      if (!n) return;
      const platform = socialPlatform(n);
      if (platform) push(out.socials, { platform, url: n }, `link "${text || platform}"`);
      if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(n)) push(out.maps, { kind: "link", url: redactUrlSecrets(n), query: null }, `map link "${text}"`);
    }
  });

  $("iframe").each((_, f) => {
    const src = $(f).attr("src") ?? $(f).attr("data-src") ?? "";
    if (!/google\.[a-z.]+\/maps/i.test(src)) return;
    const n = normalizeUrl(src, url);
    if (!n) return;
    const q = new URL(n).searchParams.get("q");
    push(out.maps, { kind: "embed", url: redactUrlSecrets(n), query: q }, "Google Maps iframe (API key redacted)");
  });

  return out;
}

/* ───────────── Navigation / footer ───────────── */

export interface NavNode {
  label: string;
  url: string | null;
  openInNewTab: boolean;
  children: NavNode[];
}

export function extractNavigation($: CheerioAPI, url: string): NavNode[] {
  const header = $('[data-elementor-type="header"]').first().length ? $('[data-elementor-type="header"]').first() : $("header").first();
  const menus = header.find("ul").filter((_, ul) => !$(ul).parents("ul").length && $(ul).children("li").children("a").length >= 3);
  const menu = menus.first();
  const walk = (ul: Cheerio<AnyNode>): NavNode[] =>
    ul
      .children("li")
      .map((_, li) => {
        const a = $(li).children("a").first();
        const label = cleanText(a.find(".menu-title, .elementor-item-text").first().text() || a.text());
        const sub = $(li).children("ul").first();
        return { label, url: normalizeUrl(a.attr("href"), url), openInNewTab: a.attr("target") === "_blank", children: sub.length ? walk(sub) : [] };
      })
      .get()
      .filter((n: NavNode) => n.label);
  return menu.length ? walk(menu) : [];
}

export interface FooterExtraction {
  columns: { title: string; links: { label: string; url: string }[] }[];
  texts: string[];
  copyright: string | null;
}

export function extractFooter($: CheerioAPI, url: string): FooterExtraction {
  const footer = $('[data-elementor-type="footer"]').first().length ? $('[data-elementor-type="footer"]').first() : $("footer").first();
  const columns: FooterExtraction["columns"] = [];
  footer.find(".elementor-column, .e-con").each((_, col) => {
    if ($(col).find(".elementor-column, .e-con").length) return; // leaf columns only
    const title = cleanText($(col).find(".elementor-heading-title").first().text());
    const links = $(col)
      .find("a[href]")
      .map((__, a) => ({ label: cleanText($(a).text()), url: normalizeUrl($(a).attr("href"), url) ?? ($(a).attr("href") ?? "") }))
      .get()
      .filter((l) => l.label && l.url);
    if (title && links.length) columns.push({ title, links });
  });
  const texts = footer
    .find(".elementor-widget-text-editor, p")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter((t, i, arr) => t && arr.indexOf(t) === i);
  return { columns, texts, copyright: texts.find((t) => /©|copyright/i.test(t)) ?? null };
}

/* ───────────── Elementor page sections (homepage → PageSection candidates) ───────────── */

export interface SectionCandidate {
  index: number;
  elementId: string | null;
  typeGuess: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  headings: string[];
  paragraphs: string[];
  items: { title: string; description: string; icon: string | null; url: string | null }[];
  buttons: { label: string; url: string }[];
  images: ImageRef[];
  linkedItems: string[];
  widgets: string[];
}

/** Top-level widgets of an Elementor document in DOM order (widgets nested in other widgets are skipped). */
function topLevelWidgets($: CheerioAPI, doc: Cheerio<AnyNode>): Element[] {
  return doc
    .find("[data-widget_type]")
    .filter((_, w) => $(w).parents("[data-widget_type]").length === 0 && $(w).closest("[data-elementor-type]").is(doc))
    .get() as Element[];
}

function isSectionHeading($: CheerioAPI, w: Element): boolean {
  return /^heading\./.test($(w).attr("data-widget_type") ?? "") && $(w).find("h1, h2").length > 0;
}

/**
 * Splits an Elementor page into content blocks: a new block starts at every H1/H2 heading widget
 * (consecutive headings are merged, the second becomes a subtitle). Each block gets a best-guess
 * PageSection type with the evidence used – these are CANDIDATES for manual review, not final sections.
 */
export function extractSections($: CheerioAPI, url: string): SectionCandidate[] {
  const doc = $('[data-elementor-type="wp-page"]').first();
  if (!doc.length) return [];
  const segments: Element[][] = [];
  let current: Element[] = [];
  for (const w of topLevelWidgets($, doc)) {
    if (isSectionHeading($, w) && current.some((x) => !isSectionHeading($, x))) {
      segments.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) segments.push(current);

  const out: SectionCandidate[] = [];
  segments.forEach((els, index) => {
    const s = $(els);
    const widgets = [...new Set(els.map((w) => ($(w).attr("data-widget_type") ?? "").replace(/\.default$/, "")))];
    const headings = s
      .find(".elementor-heading-title, h1, h2, h3")
      .map((_, h) => cleanText($(h).text()))
      .get()
      .filter((t, i, arr) => t && arr.indexOf(t) === i);
    const paragraphs = els
      .filter((w) => /^text-editor\./.test($(w).attr("data-widget_type") ?? ""))
      .flatMap((w) => {
        const ps = $(w)
          .find("p")
          .map((_, p) => cleanText($(p).text()))
          .get()
          .filter(Boolean);
        return ps.length ? ps : [cleanText($(w).text())];
      })
      .filter((t, i, arr) => t && t.length > 2 && arr.indexOf(t) === i);
    const items = s
      .filter(".elementor-widget-icon-box, .elementor-widget-image-box")
      .add(s.find(".elementor-widget-icon-box, .elementor-widget-image-box"))
      .map((_, b) => ({
        title: cleanText($(b).find(".elementor-icon-box-title, .elementor-image-box-title").first().text()),
        description: cleanText($(b).find(".elementor-icon-box-description, .elementor-image-box-description").first().text()),
        icon: $(b).find("i").first().attr("class") ?? null,
        url: normalizeUrl($(b).find("a[href]").first().attr("href"), url),
      }))
      .get()
      .filter((i, idx, arr) => i.title && arr.findIndex((x) => x.title === i.title) === idx);
    const buttons = s
      .find("a.elementor-button, .elementor-button-link")
      .map((_, a) => ({ label: cleanText($(a).text()), url: normalizeUrl($(a).attr("href"), url) ?? "" }))
      .get()
      .filter((b) => b.label);
    const linkedItems = [
      ...new Set(
        s
          .find("a[href]")
          .map((_, a) => normalizeUrl($(a).attr("href"), url))
          .get()
          .filter((u): u is string => Boolean(u) && /\/(to_book|destination|excursion|offers)\/[^/]+\/$/.test(u)),
      ),
    ];
    const images = extractImages($, url, s, "section");
    const evidence: string[] = [];
    let typeGuess = "richText";
    let confidence: SectionCandidate["confidence"] = "low";
    const text = `${headings.join(" ")} ${paragraphs.join(" ")}`.toLowerCase();
    if (widgets.some((w) => /search-form/.test(w)) || index === 0) {
      typeGuess = "hero";
      confidence = index === 0 ? "high" : "medium";
      evidence.push(index === 0 ? "first block on the page" : "search form");
    } else if (s.find("[id^='wprev-slider']").length) {
      typeGuess = "tripadvisor";
      confidence = "high";
      evidence.push("TripAdvisor review slider");
    } else if (s.find(".sbi_item, #sb_instagram").length) {
      typeGuess = "gallery";
      confidence = "medium";
      evidence.push("Instagram feed");
    } else if (widgets.some((w) => /accordion|toggle/.test(w))) {
      typeGuess = "faqs";
      confidence = "medium";
      evidence.push("accordion widget");
    } else if (items.length >= 3) {
      typeGuess = /why|process|easy|choose|benefit/.test(text) ? "whyChooseUs" : "features";
      confidence = "medium";
      evidence.push(`${items.length} icon/image boxes`);
    } else if (/driver|guide|vehicle/.test(text) && linkedItems.some((u) => /-(car|van|bus|suv)\/$/.test(u))) {
      typeGuess = "vehicles";
      confidence = "medium";
      evidence.push("links to driver/vehicle items");
    } else if (linkedItems.some((u) => /\/(to_book|offers)\//.test(u))) {
      typeGuess = "popularTours";
      confidence = "medium";
      evidence.push(`${linkedItems.length} links to tours`);
    } else if (linkedItems.some((u) => /\/destination\//.test(u)) || widgets.some((w) => /taxonomy-item/.test(w))) {
      typeGuess = "destinations";
      confidence = "medium";
      evidence.push(linkedItems.length ? "links to destinations" : "location taxonomy widget");
    } else if (widgets.some((w) => /google_maps|form/.test(w))) {
      typeGuess = "contact";
      confidence = "medium";
      evidence.push("map / form widget");
    } else if (buttons.length && paragraphs.length <= 2) {
      typeGuess = "cta";
      confidence = "low";
      evidence.push("short text with button");
    }
    if (!headings.length && !paragraphs.length && !items.length && !images.length && !linkedItems.length) return;
    out.push({ index, elementId: $(els[0]).attr("data-id") ?? null, typeGuess, confidence, evidence, headings, paragraphs, items, buttons, images, linkedItems, widgets });
  });
  return out;
}
