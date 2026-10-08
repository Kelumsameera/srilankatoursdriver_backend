import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { slugify } from "../src/utils/helpers.js";
import { classifyUrl, isLikelyTestContent, refineClassification } from "../migration/src/lib/classify.js";
import { PoliteFetcher } from "../migration/src/lib/fetcher.js";
import { contentRoot, decodeCloudflareEmails, htmlToMarkdown, loadHtml, meaningfulAlt } from "../migration/src/lib/html.js";
import { MediaCollector, wpOriginalUrl } from "../migration/src/lib/media.js";
import { isAllowedByRobots, parseRobots } from "../migration/src/lib/robots.js";
import { parseSitemap } from "../migration/src/lib/sitemap.js";
import { decodeCfEmail, normalizePhone, parseAllPrices, parseDate, parseDuration, parsePrice } from "../migration/src/lib/text.js";
import { dedupeUrls, fileKeyForUrl, normalizeUrl, redactUrlSecrets, slugFromUrl } from "../migration/src/lib/url.js";
import { extractBookingItem, extractExcursion, extractFaqs, extractGeneric, extractTripadvisorReviews, socialPlatform } from "../migration/src/extract.js";
import { cmsSlugify, isValidCmsSlug, pickImages, proposedNewPath } from "../migration/src/normalize.js";
import { extractPage } from "../migration/src/discover.js";
import type { DiscoveredUrl } from "../migration/src/types.js";

const SITE = "https://srilankatoursdriver.com";

/* ───────────── URL normalization ───────────── */

describe("migration: URL normalization", () => {
  it("folds www, forces https, adds the WordPress trailing slash and drops fragments", () => {
    expect(normalizeUrl("http://www.SriLankaToursDriver.com/to_book/galle-one-day-tour#gallery")).toBe(`${SITE}/to_book/galle-one-day-tour/`);
    expect(normalizeUrl("https://srilankatoursdriver.com")).toBe(`${SITE}/`);
  });

  it("removes tracking parameters and sorts the remaining query", () => {
    expect(normalizeUrl(`${SITE}/tours/?utm_source=fb&b=2&fbclid=x&a=1`)).toBe(`${SITE}/tours/?a=1&b=2`);
    expect(normalizeUrl(`${SITE}/wp-content/uploads/a.css?ver=6.2`)).toBe(`${SITE}/wp-content/uploads/a.css`);
  });

  it("resolves relative links and keeps file paths without a trailing slash", () => {
    expect(normalizeUrl("../../excursion/kandy", `${SITE}/destination/x/`)).toBe(`${SITE}/excursion/kandy/`);
    expect(normalizeUrl("/wp-content/uploads/2022/05/logo.png", SITE)).toBe(`${SITE}/wp-content/uploads/2022/05/logo.png`);
  });

  it("rejects non-http links", () => {
    for (const bad of ["mailto:info@x.com", "tel:+94769300334", "javascript:alert(1)", "data:image/png;base64,AAA", "#top", "", null, "http://[bad"]) {
      expect(normalizeUrl(bad as string)).toBeNull();
    }
  });

  it("leaves external hosts' protocol and slashes alone", () => {
    expect(normalizeUrl("http://example.org/path?utm_medium=x")).toBe("http://example.org/path");
  });

  it("produces stable, filesystem-safe cache keys", () => {
    expect(fileKeyForUrl(`${SITE}/`)).toBe("index");
    expect(fileKeyForUrl(`${SITE}/to_book/galle-one-day-tour/`)).toBe("to_book__galle-one-day-tour");
    expect(fileKeyForUrl(`${SITE}/?page_id=964`)).toBe(fileKeyForUrl(`${SITE}/?page_id=964`));
    expect(fileKeyForUrl(`${SITE}/?page_id=964`)).not.toBe(fileKeyForUrl(`${SITE}/?page_id=965`));
  });

  it("redacts API keys in URLs written to reports", () => {
    const out = redactUrlSecrets("https://www.google.com/maps/embed/v1/place?key=AIzaSECRET&q=Bandaragama");
    expect(out).not.toContain("AIzaSECRET");
    expect(out).toContain("q=Bandaragama");
  });
});

describe("migration: duplicate URL detection", () => {
  it("collapses spelling variants onto one URL and reports the aliases", () => {
    const { unique, duplicates, invalid } = dedupeUrls([
      `${SITE}/tours/`,
      "http://www.srilankatoursdriver.com/tours",
      `${SITE}/tours/#top`,
      `${SITE}/tours/?utm_campaign=x`,
      `${SITE}/faq/`,
      "mailto:info@srilankatoursdriver.com",
    ]);
    expect(unique).toEqual([`${SITE}/tours/`, `${SITE}/faq/`]);
    expect(duplicates).toHaveLength(3);
    expect(invalid).toEqual(["mailto:info@srilankatoursdriver.com"]);
  });
});

/* ───────────── Classification + slugs ───────────── */

describe("migration: page classification", () => {
  const cat = (p: string) => classifyUrl(`${SITE}${p}`);

  it("classifies the old site's URL patterns", () => {
    expect(cat("/").category).toBe("homepage");
    expect(cat("/to_book/udawalawa-safari-one-day-tour/").category).toBe("tour-detail");
    expect(cat("/to_book/mahesh-car/").category).toBe("vehicle");
    expect(cat("/to_book/saman-kdh-highroof-van/").category).toBe("vehicle");
    expect(cat("/excursion/kandy/")).toMatchObject({ category: "excursion", subtype: "transfer-rates" });
    expect(cat("/destination/yala-national-park/").category).toBe("destination");
    expect(cat("/offers/10-days-east-coast-tour-offer/")).toMatchObject({ category: "tour-detail", subtype: "offer" });
    expect(cat("/about-us/").category).toBe("about");
    expect(cat("/contact/").category).toBe("contact");
    expect(cat("/faq/").category).toBe("faq");
    expect(cat("/gallery/").category).toBe("gallery");
    expect(cat("/privacy-policy/")).toMatchObject({ category: "page", subtype: "legal" });
  });

  it("marks listings, archives and pagination", () => {
    expect(cat("/excursions/")).toMatchObject({ category: "excursion", isListing: true });
    expect(cat("/sri-lanka-round-tours/")).toMatchObject({ category: "tours", isListing: true, subtype: "round-tours" });
    expect(cat("/to_book/")).toMatchObject({ category: "tours", isListing: true, subtype: "to_book-archive" });
    expect(cat("/to_book/page/2/")).toMatchObject({ category: "tours", isListing: true, subtype: "pagination", excludeFromImport: true });
    expect(cat("/tours/?paged=2")).toMatchObject({ subtype: "pagination", excludeFromImport: true });
  });

  it("excludes system, test and asset URLs from import", () => {
    expect(cat("/checkout/")).toMatchObject({ category: "system", excludeFromImport: true });
    expect(cat("/ba-wishlist/").excludeFromImport).toBe(true);
    expect(cat("/test-pg/")).toMatchObject({ category: "system", excludeFromImport: true });
    expect(cat("/elementor-7306/").excludeFromImport).toBe(true);
    expect(cat("/offers/5-days-test-offer/").excludeFromImport).toBe(true);
    expect(cat("/wp-content/uploads/2022/05/logo.png")).toMatchObject({ category: "asset", excludeFromImport: true });
    expect(classifyUrl("https://www.facebook.com/x").excludeFromImport).toBe(true);
    expect(isLikelyTestContent("test2")).toBe(true);
    expect(isLikelyTestContent("Sri Lanka Round Tours")).toBe(false);
    expect(isLikelyTestContent("contest-winners")).toBe(false);
  });

  it("refines a /to_book/ item into a vehicle when the content describes a driver", () => {
    const base = classifyUrl(`${SITE}/to_book/some-listing/`);
    expect(base.category).toBe("tour-detail");
    const refined = refineClassification(base, { bodyClasses: ["single-to_book"], title: "Kasun", text: "More Info: Type of Vehicle : Toyota Prius Years of Experience: 10 Years", slug: "some-listing" });
    expect(refined.category).toBe("vehicle");
    const tour = refineClassification(base, { bodyClasses: ["single-to_book"], title: "10 Days East Coast Tour", text: "This 10 days tour covers Ella.", slug: "some-listing" });
    expect(tour.category).toBe("tour-detail");
  });

  it("maps old URLs to proposed new paths", () => {
    const p = (u: string) => proposedNewPath({ sourceUrl: `${SITE}${u}`, classification: classifyUrl(`${SITE}${u}`) });
    expect(p("/to_book/galle-one-day-tour/")).toBe("/tours/galle-one-day-tour");
    expect(p("/destination/yala-national-park/")).toBe("/destinations/yala-national-park");
    expect(p("/faq/")).toBe("/faqs");
    expect(p("/sri-lanka-one-day-tours/")).toBe("/tours?category=one-day-tours");
    expect(p("/checkout/")).toBeNull();
  });
});

describe("migration: slug extraction", () => {
  it("preserves the old slug from the URL", () => {
    expect(slugFromUrl(`${SITE}/to_book/udawalawa-safari-one-day-tour/`)).toBe("udawalawa-safari-one-day-tour");
    expect(slugFromUrl(`${SITE}/destination/St-Marys-Church-Negambo`)).toBe("st-marys-church-negambo");
    expect(slugFromUrl(`${SITE}/caf%C3%A9/`)).toBe("café");
    expect(slugFromUrl(`${SITE}/`)).toBeNull();
    expect(slugFromUrl(`${SITE}/?page_id=964`)).toBeNull();
  });

  it("validates slugs with the CMS rule and slugifies exactly like the backend helper", () => {
    expect(isValidCmsSlug("05-days-tour-sri-lanka")).toBe(true);
    expect(isValidCmsSlug("add_services")).toBe(false);
    expect(isValidCmsSlug("café")).toBe(false);
    expect(isValidCmsSlug("")).toBe(false);
    for (const s of ["Ella & Nine Arches – Day 1!", "Kumara (Podi) – Car", "   "]) expect(cmsSlugify(s)).toBe(slugify(s));
  });
});

/* ───────────── Price / duration / misc text parsing ───────────── */

describe("migration: price extraction", () => {
  it("parses symbol-first and code-last prices with thousands separators", () => {
    expect(parsePrice("Price From $640.00")).toEqual({ amount: 640, currency: "USD", raw: "$640.00" });
    expect(parsePrice("28,000LKR")).toEqual({ amount: 28000, currency: "LKR", raw: "28,000LKR" });
    expect(parsePrice("USD 1,280 for two")).toMatchObject({ amount: 1280, currency: "USD" });
    expect(parsePrice("Rs. 5000 per day")).toMatchObject({ amount: 5000, currency: "LKR" });
    expect(parsePrice("€ 49.5")).toMatchObject({ amount: 49.5, currency: "EUR" });
  });

  it("never invents a price from a bare number", () => {
    expect(parsePrice("Max People 10")).toBeNull();
    expect(parsePrice("Day 01")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it("finds every price in a text", () => {
    const all = parseAllPrices("* $1280 for Two Persons, $1900 for four. Van: 35,000LKR");
    expect(all.map((p) => [p.amount, p.currency])).toEqual([
      [1280, "USD"],
      [1900, "USD"],
      [35000, "LKR"],
    ]);
  });

  it("parses durations without guessing missing parts", () => {
    expect(parseDuration("10 days")).toMatchObject({ days: 10, nights: null, hours: null });
    expect(parseDuration("10 Days 9 Nights")).toMatchObject({ days: 10, nights: 9 });
    expect(parseDuration("05-days-tour-sri-lanka")).toMatchObject({ days: 5 });
    expect(parseDuration("4.15 Hours (Toll Road)")).toMatchObject({ hours: 4.15, days: null });
    expect(parseDuration("one day tour")).toMatchObject({ days: 1 });
    expect(parseDuration("Duration")).toBeNull();
  });

  it("normalizes phone numbers, dates and Cloudflare-protected e-mails", () => {
    expect(normalizePhone("(+94) 769 300 334")).toBe("+94769300334");
    expect(normalizePhone("0094 76 930 0334")).toBe("+94769300334");
    expect(normalizePhone("12")).toBeNull();
    expect(parseDate("April 8, 2025")).toBe("2025-04-08");
    expect(parseDate("not a date")).toBeNull();
    // "info@srilankatoursdriver.com" XOR-encoded with key 0x42
    const key = 0x42;
    const encoded = key.toString(16) + [..."info@srilankatoursdriver.com"].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
    expect(decodeCfEmail(encoded)).toBe("info@srilankatoursdriver.com");
    expect(decodeCfEmail("zz")).toBeNull();
  });
});

/* ───────────── Safe HTML parsing ───────────── */

describe("migration: safe HTML parsing", () => {
  it("never executes scripts or inline handlers while parsing", () => {
    const g = globalThis as { __pwned?: boolean };
    const $ = loadHtml(`<html><body><script>globalThis.__pwned = true</script><img src="x" onerror="globalThis.__pwned = true"><div id="content"><p>Hello</p></div></body></html>`);
    expect(g.__pwned).toBeUndefined();
    expect($("p").text()).toBe("Hello");
  });

  it("tolerates malformed / empty markup", () => {
    expect(() => loadHtml("<div><p>unclosed <b>tags")).not.toThrow();
    expect(() => extractGeneric(loadHtml(""), `${SITE}/x/`)).not.toThrow();
    expect(htmlToMarkdown("", SITE)).toBe("");
  });

  it("strips site chrome, forms and scripts from the content area", () => {
    const $ = loadHtml(`<body><div data-elementor-type="header"><nav>Menu</nav></div><div id="content"><h1>Title</h1><p>Body text</p><form><input name="email"></form><script>bad()</script><aside>Recent posts</aside></div><div data-elementor-type="footer">Footer</div></body>`);
    const text = contentRoot($).text();
    expect(text).toContain("Body text");
    for (const junk of ["Menu", "bad()", "Recent posts", "Footer"]) expect(text).not.toContain(junk);
  });

  it("converts HTML to Markdown without raw HTML, scripts or images", () => {
    const md = htmlToMarkdown(
      `<h4>Day 01</h4><p>Pickup at <strong>Negombo</strong> <a href="/to_book/x/">tour</a></p><ul><li>Fish Market</li><li>Fort</li></ul><script>alert(1)</script><img src="a.jpg" onerror="x()"><p>*Minimum two persons &lt;b&gt;</p><table><tr><th>Car</th></tr><tr><td>28,000LKR</td></tr></table>`,
      SITE,
    );
    expect(md).toContain("## Day 01");
    expect(md).toContain("**Negombo**");
    expect(md).toContain(`[tour](${SITE}/to_book/x/)`);
    expect(md).toContain("- Fish Market\n- Fort");
    expect(md).toContain("| Car |\n| --- |\n| 28,000LKR |");
    expect(md).toContain("\\*Minimum two persons \\<b\\>");
    expect(md).not.toMatch(/alert|onerror|<img|a\.jpg/);
  });

  it("turns <br> into hard line breaks and merges adjacent bold runs", () => {
    expect(htmlToMarkdown("<p><b>IDEAL</b><br>• Jan<br>• Feb<br></p>", SITE)).toBe("**IDEAL**\\\n• Jan\\\n• Feb");
    expect(htmlToMarkdown("<p><strong>Kandy,</strong><strong>Ella</strong></p>", SITE)).toBe("**Kandy,Ella**");
  });

  it("decodes Cloudflare-obfuscated e-mails in place", () => {
    const key = 0x1f;
    const hex = key.toString(16).padStart(2, "0") + [..."info@srilankatoursdriver.com"].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
    const $ = loadHtml(`<p>Email: <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</a></p>`);
    expect(decodeCloudflareEmails($)).toEqual(["info@srilankatoursdriver.com"]);
    expect($("p").text()).toBe("Email: info@srilankatoursdriver.com");
  });

  it("drops meaningless alt texts", () => {
    expect(meaningfulAlt("Gallery Thumbnail 0")).toBeNull();
    expect(meaningfulAlt("IMG_1234.jpg")).toBeNull();
    expect(meaningfulAlt(" Yala leopard ")).toBe("Yala leopard");
  });
});

/* ───────────── Extractors on representative fixtures ───────────── */

const TOUR_FIXTURE = `<html><head><title>10 Days East Coast Tour - Sri Lanka Tours Drivers</title>
<meta name="description" content="Visit Sri Lanka">
<meta property="og:image" content="${SITE}/wp-content/uploads/2022/05/hero.jpg">
<link rel="canonical" href="${SITE}/to_book/10-days-east-coast-tour-sri-lanka/"></head>
<body class="to_book-template-default single single-to_book postid-7858"><div id="content">
<h1>10 Days East Coast Tour</h1>
<div class="elementor-widget-babe-item-price-from"><h4 class="babe-section-title">Price</h4><div class="item_info_price"><label>From </label><span class="item_info_price_new"><span class="currency_amount" data-amount="640"><span class="currency_symbol">$</span>640.00</span></span></div></div>
<div class="elementor-widget-babe-item-duration"><h4 class="babe-section-title">Duration</h4><div class="item-days item-meta-value"><span>10 days</span></div></div>
<div class="elementor-widget-babe-item-max-guests"><h4 class="babe-section-title">Max People</h4><div class="item-meta-value">10</div></div>
<div class="elementor-widget-babe-item-content"><div class="elementor-widget-container"><p>This 10 days tour covers Negombo, Ella, Kandy.</p><p>* $1280 for Two Persons</p></div></div>
<div class="elementor-widget-babe-item-included"><ul><li><i class="far fa-check-circle"></i><span class="list-text">Fuel</span></li><li><i class="far fa-check-circle"></i><span class="list-text">English Speaking Professional Driver</span></li></ul></div>
<div class="elementor-widget-babe-item-included"><ul><li><i class="far fa-times-circle"></i><span class="list-text">Train Ticket(s)</span></li></ul></div>
<div class="elementor-widget-babe-item-steps">
 <div class="block_step"><div class="block_step_title"><h4 class="step_title">Day 01</h4></div><div class="block_step_content"><div class="content"><p>Pickup from Airport</p><ul><li>Negombo Fish Market</li></ul><p>Overnight stay at Negombo</p><p>Depends on arrival time.</p></div></div></div>
 <div class="block_step"><div class="block_step_title"><h4 class="step_title">Day 02</h4></div><div class="block_step_content"><div class="content"><p>Drive to Ella</p></div></div></div>
</div>
<div class="elementor-widget-babe-item-slideshow"><img src="${SITE}/wp-content/uploads/2022/05/hero-960x450.jpg"><img src="${SITE}/wp-content/uploads/2022/05/hero-150x150.jpg" alt="Gallery Thumbnail 0"></div>
</div></body></html>`;

describe("migration: extractors", () => {
  it("extracts a BA Book Everything tour page", () => {
    const $ = loadHtml(TOUR_FIXTURE);
    const t = extractBookingItem($, `${SITE}/to_book/10-days-east-coast-tour-sri-lanka/`);
    expect(t.title).toBe("10 Days East Coast Tour");
    expect(t.priceFrom).toMatchObject({ amount: 640, currency: "USD", label: "From" });
    expect(t.duration).toMatchObject({ days: 10 });
    expect(t.maxGuests).toBe(10);
    expect(t.included).toEqual(["Fuel", "English Speaking Professional Driver"]);
    expect(t.excluded).toEqual(["Train Ticket(s)"]);
    expect(t.steps.map((s) => [s.dayNumber, s.overnight])).toEqual([
      [1, "Negombo"],
      [2, null],
    ]);
    expect(t.steps[0].listItems).toEqual(["Negombo Fish Market"]);
    expect(t.destinationsMentioned).toEqual(["Negombo", "Ella", "Kandy"]);
    expect(t.pricesInContent.map((p) => p.amount)).toEqual([1280]);
    expect(pickImages(t.galleryImages).map((i) => i.url)).toEqual([`${SITE}/wp-content/uploads/2022/05/hero-960x450.jpg`]);
  });

  it("parses an excursion transfer-rate table", () => {
    const $ = loadHtml(`<body class="single-excursion"><div id="content"><h1>Kandy</h1><img src="${SITE}/wp-content/uploads/2024/10/kandy.jpg" alt="Kandy"><table><thead><tr><th>From</th><th>Destination</th><th>Car</th><th>Van</th><th>Estimated Duration</th><th>Mileage (Km)</th></tr></thead><tbody><tr><td>Kandy</td><td>Airport</td><td>28,000LKR</td><td>35,000LKR</td><td>3 Hours <span>(Toll Road)</span></td><td>115Km</td></tr></tbody></table><form><p>Vehicle Type</p></form></div></body>`);
    const e = extractExcursion($, `${SITE}/excursion/kandy/`);
    expect(e.title).toBe("Kandy");
    expect(e.rates).toHaveLength(1);
    expect(e.rates[0]).toMatchObject({ from: "Kandy", destination: "Airport", durationHours: 3, tollRoad: true, mileageKm: 115 });
    expect(e.rates[0].prices.Car).toMatchObject({ amount: 28000, currency: "LKR" });
    expect(e.transferFormPresent).toBe(true);
    expect(e.descriptionParagraphs).not.toContain("Vehicle Type");
  });

  it("extracts FAQ accordions and TripAdvisor reviews", () => {
    const $ = loadHtml(`<div class="elementor-section"><h2 class="elementor-heading-title">Find Answers</h2>
      <div class="elementor-accordion-item"><div class="elementor-tab-title"><a class="elementor-accordion-title">WHAT IS ETA?</a></div><div class="elementor-tab-content"><p>An online visa.</p></div></div></div>
      <div id="wprev-slider-1"><div class="w3_wprs-col"><p class="wprev_preview_tcolor1_T1"><span class="wptripadvisor_star_imgs_T1"><img src="/x/tripadvisor_stars_4.png"></span><span class="wprevrevtitle">Great</span>&nbsp;–&nbsp;Lovely trip<a class="wprs_rd_more">… read more</a><span class="wprs_rd_more_text" style="display:none"> with Sisira.</span></p>
      <a href="https://www.tripadvisor.com/Attraction_Review-g1-d2-Reviews-X.html">ta</a><span class="wprev_preview_tcolor2_T1">Jane D<br><span class="wprev_showdate_T1">April 8, 2025</span></span></div></div>`);
    const faqs = extractFaqs($, `${SITE}/faq/`);
    expect(faqs).toEqual([expect.objectContaining({ question: "WHAT IS ETA?", answerMarkdown: "An online visa.", group: "Find Answers" })]);
    const reviews = extractTripadvisorReviews($, SITE);
    expect(reviews).toEqual([expect.objectContaining({ guestName: "Jane D", rating: 4, title: "Great", text: "Lovely trip with Sisira.", date: "2025-04-08", platform: "tripadvisor" })]);
  });

  it("recognises social profile links but not share/post links", () => {
    expect(socialPlatform("https://www.facebook.com/srilankatoursdriver")).toBe("facebook");
    expect(socialPlatform("https://www.facebook.com/sharer.php?u=x")).toBeNull();
    expect(socialPlatform("https://www.instagram.com/srilankatoursdriver/")).toBe("instagram");
    expect(socialPlatform("https://www.instagram.com/p/Cm16mGjNdkE/")).toBeNull();
    expect(socialPlatform("https://www.youtube.com/channel/UC2CNnfA5zDLKQjtV7ogxwdA")).toBe("youtube");
  });

  it("extracts a page deterministically (re-running yields identical records)", () => {
    const entry: DiscoveredUrl = {
      url: `${SITE}/to_book/10-days-east-coast-tour-sri-lanka/`,
      classification: classifyUrl(`${SITE}/to_book/10-days-east-coast-tour-sri-lanka/`),
      discoveredVia: ["sitemap:to_book-sitemap.xml"],
      discoveredAt: "2026-01-01T00:00:00.000Z",
      robotsAllowed: true,
      fetched: true,
      httpStatus: 200,
      finalUrl: null,
      error: null,
      skippedReason: null,
    };
    const a = extractPage(entry.url, TOUR_FIXTURE, entry, new MediaCollector());
    const b = extractPage(entry.url, TOUR_FIXTURE, entry, new MediaCollector());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.parsingErrors).toEqual([]);
    expect(a.wpPostId).toBe(7858);
    expect(a.generic?.seo.canonical).toBe(entry.url);
  });
});

/* ───────────── Media deduplication ───────────── */

describe("migration: media deduplication", () => {
  it("stores each URL once and merges usages, roles and alt text", () => {
    const m = new MediaCollector();
    const url = `${SITE}/wp-content/uploads/2022/05/hero.jpg`;
    m.add({ url, sourcePage: `${SITE}/a/`, pageCategory: "tour-detail", role: "og-image" });
    m.add({ url: `${url}?ver=2`, sourcePage: `${SITE}/b/`, pageCategory: "destination", role: "hero", altText: "Hero" });
    m.add({ url: "http://www.srilankatoursdriver.com/wp-content/uploads/2022/05/hero.jpg", sourcePage: `${SITE}/a/`, pageCategory: "tour-detail", role: "og-image" });
    expect(m.size).toBe(1);
    const [rec] = m.list();
    expect(rec.sourcePages).toEqual([`${SITE}/a/`, `${SITE}/b/`]);
    expect(rec.roles).toEqual(["og-image", "hero"]);
    expect(rec.usedFor).toEqual(["tour-detail", "destination"]);
    expect(rec.altText).toBe("Hero");
    expect(rec.usages).toHaveLength(2);
  });

  it("groups WordPress size variants under their original and excludes UI assets", () => {
    expect(wpOriginalUrl(`${SITE}/wp-content/uploads/2022/05/hero-1000x565.jpg`)).toEqual({ originalUrl: `${SITE}/wp-content/uploads/2022/05/hero.jpg`, isSizeVariant: true, width: 1000, height: 565 });
    const m = new MediaCollector();
    for (const size of ["", "-1000x565", "-150x150"]) m.add({ url: `${SITE}/wp-content/uploads/2022/05/hero${size}.jpg`, sourcePage: SITE, pageCategory: "homepage", role: "content" });
    m.add({ url: `${SITE}/wp-content/plugins/x/stars_5.png`, sourcePage: SITE, pageCategory: "homepage", role: "ui-asset" });
    m.add({ url: `${SITE}/wp-content/uploads/2024/01/hero.jpg`, sourcePage: SITE, pageCategory: "homepage", role: "content" });
    const dup = m.duplicateReport();
    expect(dup.sizeVariantGroups).toEqual([{ originalUrl: `${SITE}/wp-content/uploads/2022/05/hero.jpg`, urls: expect.arrayContaining([expect.stringContaining("hero-150x150"), expect.stringContaining("hero-1000x565")]) }]);
    expect(dup.sameFilenameDifferentFolders).toEqual([{ filename: "hero.jpg", originals: [`${SITE}/wp-content/uploads/2022/05/hero.jpg`, `${SITE}/wp-content/uploads/2024/01/hero.jpg`] }]);
    expect(m.list().find((r) => r.sourceUrl.includes("stars_5"))).toMatchObject({ excludeFromImport: true });
    expect(m.list().find((r) => r.sourceUrl.endsWith("-1000x565.jpg"))).toMatchObject({ width: 1000, height: 565, dimensionsSource: "filename" });
  });
});

/* ───────────── robots.txt + sitemaps ───────────── */

describe("migration: robots.txt and sitemaps", () => {
  it("applies the longest matching rule (Allow wins ties)", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nCrawl-delay: 2\n\nSitemap: https://srilankatoursdriver.com/sitemap_index.xml", "SLTD-migration-discovery/1.0");
    expect(rules.crawlDelaySec).toBe(2);
    expect(rules.sitemaps).toEqual(["https://srilankatoursdriver.com/sitemap_index.xml"]);
    expect(isAllowedByRobots(rules, `${SITE}/wp-admin/options.php`)).toBe(false);
    expect(isAllowedByRobots(rules, `${SITE}/wp-admin/admin-ajax.php`)).toBe(true);
    expect(isAllowedByRobots(rules, `${SITE}/to_book/x/`)).toBe(true);
  });

  it("parses sitemap indexes and url sets with images", () => {
    const index = parseSitemap(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${SITE}/to_book-sitemap.xml</loc></sitemap><sitemap><loc>${SITE}/to_book-sitemap.xml</loc></sitemap></sitemapindex>`, `${SITE}/sitemap_index.xml`);
    expect(index).toMatchObject({ kind: "index", sitemaps: [`${SITE}/to_book-sitemap.xml`] });
    const set = parseSitemap(
      `<?xml version="1.0"?><urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>${SITE}/to_book/a</loc><lastmod>2025-01-01</lastmod><image:image><image:loc>${SITE}/wp-content/uploads/a.jpg</image:loc></image:image></url><url><loc>not a url</loc></url></urlset>`,
      `${SITE}/to_book-sitemap.xml`,
    );
    expect(set.urls).toEqual([{ loc: `${SITE}/to_book/a/`, lastmod: "2025-01-01", images: [{ loc: `${SITE}/wp-content/uploads/a.jpg`, title: null, caption: null }] }]);
    expect(parseSitemap("<html>nope</html>", SITE).kind).toBe("unknown");
  });
});

/* ───────────── Failed URL handling ───────────── */

describe("migration: failed URL handling", () => {
  const response = (status: number, body = "", headers: Record<string, string> = {}) => new Response(status === 204 || status === 304 ? null : body, { status, headers });
  const make = (impl: (url: string) => Response | Promise<Response>) => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => impl(String(input)));
    const fetcher = new PoliteFetcher({ userAgent: "test", minDelayMs: 0, timeoutMs: 1000, retries: 2, maxRedirects: 3, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    return { fetcher, fetchImpl };
  };

  it("returns 404s as failures without retrying", async () => {
    const { fetcher, fetchImpl } = make(() => response(404, "not found"));
    const res = await fetcher.get(`${SITE}/airport-transfers/`);
    expect(res).toMatchObject({ status: 404, error: "HTTP 404", attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetcher.stats.failures).toBe(1);
  });

  it("retries 5xx / 429 and network errors, then reports the failure", async () => {
    const flaky = make(() => response(503));
    const res = await flaky.fetcher.get(`${SITE}/x/`);
    expect(res).toMatchObject({ status: 503, error: "HTTP 503", attempts: 3 });
    expect(flaky.fetchImpl).toHaveBeenCalledTimes(3);

    let calls = 0;
    const recovering = make(() => (++calls < 2 ? Promise.reject(new TypeError("ECONNRESET")) : response(200, "<html>ok</html>", { "content-type": "text/html" })));
    const ok = await recovering.fetcher.get(`${SITE}/y/`);
    expect(ok).toMatchObject({ status: 200, error: null, attempts: 2, body: "<html>ok</html>" });

    const dead = make(() => Promise.reject(new TypeError("ENOTFOUND")));
    const down = await dead.fetcher.get(`${SITE}/z/`);
    expect(down.status).toBeNull();
    expect(down.error).toMatch(/network error: ENOTFOUND/);
  });

  it("reports timeouts", async () => {
    const { fetcher } = make(() => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })));
    const res = await fetcher.get(`${SITE}/slow/`);
    expect(res.error).toMatch(/timeout after 1000ms/);
  });

  it("follows internal redirects but refuses to leave the old site", async () => {
    const internal = make((url) => (url.endsWith("/ba_locations/kandy/") ? response(301, "", { location: "/excursion/kandy/" }) : response(200, "<html></html>", { "content-type": "text/html" })));
    const res = await internal.fetcher.get(`${SITE}/ba_locations/kandy/`);
    expect(res).toMatchObject({ status: 200, finalUrl: `${SITE}/excursion/kandy/`, redirects: [`${SITE}/excursion/kandy/`], error: null });

    const external = make(() => response(302, "", { location: "https://evil.example.com/" }));
    const out = await external.fetcher.get(`${SITE}/go/`);
    expect(out.error).toMatch(/redirect to external host refused/);
    expect(external.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never requests URLs disallowed by robots.txt or outside the site", async () => {
    const { fetcher, fetchImpl } = make(() => response(200));
    fetcher.setRobots(parseRobots("User-agent: *\nDisallow: /wp-admin/", "test"));
    expect((await fetcher.get(`${SITE}/wp-admin/`)).error).toBe("blocked by robots.txt");
    expect((await fetcher.get("https://example.com/")).error).toMatch(/external host/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

/* ───────────── Safety: the migration tooling cannot touch MongoDB or Cloudinary ───────────── */

describe("migration: read-only safety", () => {
  it("imports no database, Cloudinary, env or application-service modules", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migration/src");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith(".ts")) files.push(path.join(d, e.name));
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const imports = [...fs.readFileSync(file, "utf8").matchAll(/(?:import|from)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${path.basename(file)} imports ${spec}`).not.toMatch(/mongoose|mongodb|cloudinary|dotenv|nodemailer|\/src\/(models|services|config|controllers|routes|app)/);
        if (spec.startsWith("../../src/")) expect(spec).toBe("../../src/scripts/seed-data.js");
      }
    }
  });
});
