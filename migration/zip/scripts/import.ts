/**
 * Step 2: imports the old Next.js site (migrate.zip → ../migrate) into the CMS.
 *
 *   npx tsx migration/zip/scripts/import.ts            # dry run – writes migration/zip/normalized/*.json only
 *   npx tsx migration/zip/scripts/import.ts --apply    # uploads images to Cloudinary and writes MongoDB
 *
 * Re-runnable: media is keyed by a deterministic Cloudinary public id (uploaded once), content is
 * upserted by slug, translations by (entity, locale). The seeded starter tours/destinations/
 * excursions/vehicles are archived (not deleted) so they disappear from the public site.
 * Site settings / contact details are NOT touched (the zip's contact.ts belongs to another business).
 */
import fs from "node:fs";
import path from "node:path";
import { Types } from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { env } from "../../../src/config/env.js";
import { SUPPORTED_LOCALES } from "../../../src/config/locales.js";
import { Category, Destination, Excursion, GalleryItem, HeroMedia, Media, Tour, Translation, Vehicle } from "../../../src/models/index.js";
import { uploadImage, uploadVideo, type MediaFolder } from "../../../src/services/cloudinary/index.js";
import { TRANSLATABLE, extractFields } from "../../../src/services/translation/registry.js";
import { hashFields, sha256, slugify } from "../../../src/utils/helpers.js";

const APPLY = process.argv.includes("--apply");
const SITE = path.resolve("../migrate");
const RAW = path.resolve("migration/zip/raw");
const OUT = path.resolve("migration/zip/normalized");
fs.mkdirSync(OUT, { recursive: true });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
const raw = (name: string) => JSON.parse(fs.readFileSync(path.join(RAW, `${name}.json`), "utf8"));
const byLocale = (name: string, key: (l: string) => string) => {
  const all = raw(name);
  return Object.fromEntries(Object.entries(all).map(([l, mod]) => [l, (mod as Any)[key(l)] as Any[]]));
};
const TOURS = byLocale("tours", () => "TOURS");
const DESTS = byLocale("destinations", () => "TOURS");
const EXCS = byLocale("excursions", () => "EXCURSIONS");
const VEHS = byLocale("vehicles", () => "vehicles");
const RATES = byLocale("packageprices", (l) => `PACKAGE_PRICES_${l.toUpperCase()}`);
const GALLERIES: Record<string, { src: string; alt: string; caption: string }[]> = raw("gallery").TOUR_GALLERIES;

const report: Any = { mode: APPLY ? "apply" : "dry-run", warnings: [] as string[], uploads: 0, reusedMedia: 0 };
const warn = (m: string) => report.warnings.push(m);

/* ───────────── text helpers ───────────── */

function shortText(text: string, max = 300): string {
  const para = text.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  if (para.length <= max) return para;
  let out = "";
  for (const s of para.match(/[^.!?。！？]+[.!?。！？]+["')\]]?\s*/gu) ?? [para]) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  return (out.trim() || para.slice(0, max - 1).trim() + "…").slice(0, max);
}
const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
/** "Day 01 - Negombo" / "Tag 01 - Negombo" → "Negombo" (the site shows the day number separately). */
const stripDayPrefix = (t: string) => t.replace(/^\s*[^\s\d\-–:]{0,12}\s?\d{1,2}[^\s\-–:]{0,4}\s*[\-–:]\s+/u, "").trim() || t.trim();
const dayLocation = (t: string) => stripDayPrefix(t).split(/\s+(?:to|→)\s+/i).pop()!.trim();
const asList = (v: unknown): string[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []).map(String);

/** Keeps a translated list only when it lines up 1:1 with the English one (older locale files have fewer items). */
function alignedList(loc: unknown, en: unknown): string[] {
  const a = asList(loc);
  const b = asList(en);
  return a.length === b.length ? a : b;
}

/* ───────────── media ───────────── */

const mediaCache = new Map<string, Any>();
async function media(src: string | undefined, folder: MediaFolder, alt: string, kind: "image" | "video" = "image"): Promise<Any | undefined> {
  if (!src) return undefined;
  const file = path.join(SITE, "public", decodeURI(src));
  if (!fs.existsSync(file)) {
    warn(`missing file ${src}`);
    return undefined;
  }
  const key = `${kind}:${src}`;
  if (mediaCache.has(key)) return { ...mediaCache.get(key), alt };
  const name = `zip-${slugify(src.replace(/\.[a-z0-9]+$/i, ""))}`;
  const publicId = `${env.CLOUDINARY_ROOT_FOLDER}/${folder}/${name}`;
  let ref: Any;
  if (!APPLY) {
    ref = { publicId, url: `(dry-run) ${src}`, resourceType: kind };
  } else {
    let doc = await Media.findOne({ publicId }).lean();
    if (doc) report.reusedMedia++;
    else {
      const asset = kind === "video" ? await uploadVideo(file, folder, { publicId: name, originalName: path.basename(file) }) : await uploadImage(file, folder, { publicId: name, originalName: path.basename(file) });
      report.uploads++;
      doc = (await Media.findOneAndUpdate(
        { publicId: asset.publicId },
        { $set: { ...asset, altText: alt, title: alt, tags: ["migrated", folder] } },
        { upsert: true, returnDocument: "after" },
      ).lean())!;
      process.stdout.write(".");
    }
    ref = { mediaId: doc._id, publicId: doc.publicId, url: doc.secureUrl, resourceType: doc.resourceType, format: doc.format, width: doc.width, height: doc.height };
    if (doc.duration) ref.duration = doc.duration;
  }
  mediaCache.set(key, ref);
  return { ...ref, alt };
}

/* ───────────── categories ───────────── */

async function category(kind: "tour" | "destination" | "excursion" | "vehicle", name: string) {
  const slug = slugify(name);
  if (!APPLY) return `(${kind}:${slug})`;
  const c = await Category.findOneAndUpdate(
    { kind, slug },
    { $setOnInsert: { kind, slug, name, enabled: true, order: 50 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return c!._id;
}
const EXC_CATEGORY: Record<string, string> = { City: "City", Cultural: "Culture", Beach: "Beach", Nature: "Nature", Wildlife: "Wildlife" };
const VEH_CATEGORY: Record<string, string> = { Car: "Car", Van: "Van", Bus: "Coach" };

/* ───────────── mappers (text only – same shape for every locale) ───────────── */

function tourText(t: Any, en: Any) {
  const itinerary = en.itinerary.map((enDay: Any, i: number) => {
    const d = t.itinerary?.[i] ?? enDay;
    const parts: string[] = [];
    if (d.description) parts.push(d.description);
    const opts = (d.options?.length === enDay.options?.length ? d.options : enDay.options) ?? [];
    for (const o of opts) {
      parts.push(`**${o.title}**\n\n${bullets(asList(o.activities))}${o.overnight ? `\n\n${o.overnight}` : ""}`);
    }
    if (d.note) parts.push(`_${d.note}_`);
    if (d.drop) parts.push(`**${d.drop}**`);
    return {
      title: stripDayPrefix(d.title ?? enDay.title),
      description: parts.join("\n\n"),
      activities: alignedList(d.activities, enDay.activities),
    };
  });
  const vehicles = alignedList(t.vehicleInfo, en.vehicleInfo);
  return {
    title: t.title,
    shortDescription: shortText(t.overview),
    description: [t.overview, vehicles.length ? bullets(vehicles) : ""].filter(Boolean).join("\n\n"),
    tourType: t.tourType ?? "",
    included: alignedList(t.included, en.included),
    excluded: alignedList(t.excluded, en.excluded),
    itinerary,
  };
}

function destinationText(d: Any) {
  const extra = [d.openHours && `**🕒** ${d.openHours}`, d.entryFee && `**🎟** ${d.entryFee}`].filter(Boolean);
  return {
    name: d.title,
    region: d.location ?? "",
    shortDescription: shortText(d.description),
    description: [d.description, ...extra].join("\n\n"),
    highlights: asList(d.tags),
    bestTimeToVisit: d.bestTime ?? "",
  };
}

function excursionText(e: Any) {
  return {
    title: e.title,
    shortDescription: shortText(e.description),
    description: e.description,
    highlights: e.subtitle ? [e.subtitle] : [],
  };
}

function vehicleText(v: Any, en: Any) {
  const drv = v.driver ?? en.driver;
  const policy = alignedList(v.paymentPolicy, en.paymentPolicy);
  return {
    type: v.type,
    description: [v.overview, policy.length ? bullets(policy) : "", drv ? `${drv.experience} · ${asList(drv.languages).join(", ")}` : ""].filter(Boolean).join("\n\n"),
    features: [...alignedList(v.features, en.features), v.fuel, v.transmission].filter(Boolean),
  };
}

/* ───────────── import ───────────── */

const docs: Record<string, Any[]> = { tours: [], destinations: [], excursions: [], vehicles: [], gallery: [], hero: [] };
const translations: Any[] = [];

async function upsertBySlug(model: any, doc: Any) {
  if (!APPLY) return new Types.ObjectId();
  const r = await model.findOneAndUpdate({ slug: doc.slug }, { $set: doc }, { upsert: true, returnDocument: "after", runValidators: true }).lean();
  return r._id;
}

/** One Translation row per locale holding only fields that really differ from English. */
function queueTranslations(entityType: string, id: Types.ObjectId, enDoc: Any, locDocs: Record<string, Any | undefined>) {
  const cfg = TRANSLATABLE[entityType];
  const source = extractFields(enDoc, cfg.fields);
  for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
    const loc = locDocs[locale];
    if (!loc) continue;
    const fields = Object.fromEntries(Object.entries(extractFields(loc, cfg.fields)).filter(([p, v]) => p in source && v.trim() && v !== source[p]));
    if (!Object.keys(fields).length) continue;
    translations.push({ entityType, entityId: id, locale, fields, source });
  }
}

async function importTours() {
  const en = TOURS.en;
  for (const [i, t] of en.entries()) {
    const slug = slugify(t.id);
    const catName = t.duration === 1 ? "Day Tours" : t.region === "east" || /east/i.test(t.id) ? "East Coast Tours" : "Down South Tours";
    const text = tourText(t, t);
    const gallery = [];
    for (const g of GALLERIES[t.id] ?? []) gallery.push(await media(g.src, "gallery", g.alt));
    const itinerary = [];
    for (const [n, d] of t.itinerary.entries()) {
      itinerary.push({
        ...text.itinerary[n],
        day: d.days?.[0] ?? n + 1,
        location: dayLocation(d.title),
        overnight: d.overnight ?? "",
        image: await media(d.image, "tours", text.itinerary[n].title),
      });
    }
    const doc = {
      ...text,
      slug,
      itinerary,
      heroMedia: await media(t.image, "tours", t.title),
      gallery: gallery.filter(Boolean),
      durationDays: t.duration,
      durationNights: Math.max(0, t.duration - 1),
      price: t.price,
      currency: "USD",
      groupSize: t.maxPeople ? `1 – ${t.maxPeople}` : "",
      tourType: text.tourType || (t.hotelsIncluded ? "Private round tour with hotels" : "Private round tour"),
      category: await category("tour", catName),
      driver: { included: true, languages: asList(VEHS.en[0]?.driver?.languages), description: "" },
      seo: { seoTitle: t.title, metaDescription: text.shortDescription.slice(0, 300) },
      status: "published",
      featured: t.duration === 1 || ["05-days-down-south", "08-days-east-coast", "10-days-down-south"].includes(t.id),
      order: i + 1,
    };
    const id = await upsertBySlug(Tour, doc);
    docs.tours.push(doc);
    const locs: Record<string, Any> = {};
    for (const l of Object.keys(TOURS)) {
      const lt = TOURS[l].find((x) => x.id === t.id);
      if (!lt) {
        if (l !== "en") warn(`tour ${t.id}: no ${l} translation in the zip`);
        continue;
      }
      if (lt.itinerary?.length !== t.itinerary.length) {
        warn(`tour ${t.id}: ${l} itinerary has ${lt.itinerary?.length} days (en ${t.itinerary.length}) – itinerary left in English`);
        lt.itinerary = undefined;
      }
      const tx = tourText(lt, t);
      locs[l] = { ...tx, tourType: lt.tourType ?? "", seo: { seoTitle: tx.title, metaDescription: tx.shortDescription.slice(0, 300) } };
    }
    queueTranslations("tour", id, doc, locs);
  }
}

async function importDestinations() {
  for (const [i, d] of DESTS.en.entries()) {
    const text = destinationText(d);
    const doc = {
      ...text,
      slug: slugify(d.id),
      heroMedia: await media(d.image, "destinations", d.title),
      category: await category("destination", d.category),
      seo: { seoTitle: d.title, metaDescription: text.shortDescription.slice(0, 300) },
      status: "published",
      featured: true,
      order: i + 1,
    };
    const id = await upsertBySlug(Destination, doc);
    docs.destinations.push(doc);
    const locs: Record<string, Any> = {};
    for (const l of Object.keys(DESTS)) {
      const ld = DESTS[l].find((x) => x.id === d.id);
      if (!ld) continue;
      const tx = destinationText({ ...ld, tags: alignedList(ld.tags, d.tags) });
      locs[l] = { ...tx, seo: { seoTitle: tx.name, metaDescription: tx.shortDescription.slice(0, 300) } };
    }
    queueTranslations("destination", id, doc, locs);
  }
}

const RATE_FOR: Record<string, string> = { "colombo-airport": "airport", sigiriya: "sigiriya-habarana" };
const lkr = (n: number) => `LKR ${n.toLocaleString("en-US")}`;

async function importExcursions() {
  const rates = RATES.en;
  for (const [i, e] of EXCS.en.entries()) {
    const text = excursionText(e);
    const rate = rates.find((r) => r.id === (RATE_FOR[e.id] ?? e.id));
    const doc: Any = {
      ...text,
      slug: slugify(e.id),
      location: e.title,
      heroMedia: await media(e.image, "excursions", e.title),
      category: await category("excursion", EXC_CATEGORY[e.category] ?? e.category),
      seo: { seoTitle: e.title, metaDescription: text.shortDescription.slice(0, 300) },
      status: "published",
      order: i + 1,
    };
    if (rate) {
      doc.price = rate.car;
      doc.currency = "LKR";
      doc.priceNote = `Car ${lkr(rate.car)} · Van ${lkr(rate.van)} · Bus ${lkr(rate.bus)} · ${rate.mileageKm} km`;
      doc.duration = rate.estimatedDuration;
    } else warn(`excursion ${e.id}: no transfer rate in packageprices`);
    const id = await upsertBySlug(Excursion, doc);
    docs.excursions.push(doc);
    const locs: Record<string, Any> = {};
    for (const l of Object.keys(EXCS)) {
      const le = EXCS[l].find((x) => x.id === e.id);
      if (!le) continue;
      const tx = excursionText(le);
      const lr = RATES[l]?.find((r) => r.id === (RATE_FOR[e.id] ?? e.id));
      locs[l] = { ...tx, duration: lr?.estimatedDuration ?? "", seo: { seoTitle: tx.title, metaDescription: tx.shortDescription.slice(0, 300) } };
    }
    queueTranslations("excursion", id, doc, locs);
  }
  const used = new Set(EXCS.en.map((e) => RATE_FOR[e.id] ?? e.id));
  for (const r of rates.filter((r) => !used.has(r.id))) warn(`transfer rate "${r.destination}" has no excursion page – not imported`);
}

async function importVehicles() {
  for (const [i, v] of VEHS.en.entries()) {
    const text = vehicleText(v, v);
    const images = [];
    const srcs = [v.image, ...asList(v.gallery).filter((g) => g !== v.image)];
    for (const [n, src] of srcs.entries()) images.push(await media(src, "vehicles", `${v.name} ${n + 1}`));
    const doc = {
      ...text,
      name: v.name,
      slug: slugify(v.id),
      images: images.filter(Boolean),
      seats: v.passengers,
      luggageCapacity: v.passengers >= 10 ? Math.round(v.passengers * 0.8) : 2,
      airConditioning: true,
      dailyRate: Number(String(v.price).replace(/[^\d.]/g, "")) || undefined,
      currency: "USD",
      category: await category("vehicle", VEH_CATEGORY[v.type] ?? v.type),
      seo: { seoTitle: v.name, metaDescription: shortText(v.overview, 300) },
      status: "published",
      order: i + 1,
    };
    const id = await upsertBySlug(Vehicle, doc);
    docs.vehicles.push(doc);
    const locs: Record<string, Any> = {};
    for (const l of Object.keys(VEHS)) {
      const lv = VEHS[l].find((x) => x.id === v.id);
      if (lv) locs[l] = vehicleText(lv, v);
    }
    queueTranslations("vehicle", id, doc, locs);
  }
}

async function importGallery() {
  const seen = new Set<string>();
  let order = 0;
  for (const items of Object.values(GALLERIES)) {
    for (const g of items) {
      if (seen.has(g.src)) continue;
      seen.add(g.src);
      const m = await media(g.src, "gallery", g.alt);
      if (!m) continue;
      const doc = { media: m, title: g.alt, caption: g.caption, altText: g.alt, tags: ["migrated"], status: "published", order: ++order };
      docs.gallery.push(doc);
      if (APPLY) await GalleryItem.updateOne({ "media.publicId": m.publicId }, { $set: doc }, { upsert: true });
    }
  }
  const extra = fs.readdirSync(path.join(SITE, "public/gallery")).filter((f) => !seen.has(`/gallery/${f}`));
  if (extra.length) warn(`gallery files without captions not imported: ${extra.join(", ")}`);
}

async function importHero() {
  const slides = [
    { name: "sigiriya", title: "Ancient kingdoms and the Lion Rock", subtitle: "Sigiriya · Lion Rock Fortress" },
    { name: "ella", title: "Misty hills and the Nine Arch Bridge", subtitle: "Ella · Hill Country" },
    { name: "mirissa", title: "Golden beaches and whale watching", subtitle: "Mirissa · South Coast" },
  ];
  for (const [i, s] of slides.entries()) {
    const doc = {
      title: s.title,
      subtitle: s.subtitle,
      description: "Tailor-made tours · Airport transfers · Day excursions",
      video: await media(`/hero/${s.name}.mp4`, "hero", s.subtitle, "video"),
      desktopImage: await media(`/hero/${s.name}-poster.webp`, "hero", s.subtitle),
      button1: { label: "Explore tours", url: "/tours", variant: "primary" },
      button2: { label: "Plan a tailor-made trip", url: "/tailor-made-tours", variant: "outline" },
      overlay: true,
      overlayOpacity: 0.45,
      order: i + 1,
      enabled: true,
      featured: i === 0,
    };
    docs.hero.push(doc);
    if (APPLY) await HeroMedia.updateOne({ "video.publicId": doc.video?.publicId ?? "-" }, { $set: doc }, { upsert: true });
  }
  // The seeded hero slide has no image/video – disable it now that real slides exist.
  if (APPLY) await HeroMedia.updateMany({ "video.publicId": { $exists: false }, "desktopImage.publicId": { $exists: false } }, { $set: { enabled: false } });
}

async function writeTranslations() {
  if (!APPLY) return;
  for (const t of translations) {
    const enc = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/\./g, "~"), v]));
    await Translation.updateOne(
      { entityType: t.entityType, entityId: t.entityId, locale: t.locale, locked: { $ne: true } },
      {
        $set: {
          fields: enc(t.fields),
          sourceHashes: enc(Object.fromEntries(Object.entries(t.source as Record<string, string>).map(([k, v]) => [k, sha256(v)]))),
          sourceHash: hashFields(t.source),
          origin: "manual",
          provider: "migration",
          published: true,
          translatedAt: new Date(),
          lastError: "",
        },
      },
      { upsert: true },
    ).catch((err: Error) => warn(`translation ${t.entityType}/${t.locale}: ${err.message}`));
  }
}

/** Seeded starter items that are not part of the old site are archived (reversible in the admin). */
async function archiveStarterContent() {
  const keep = { tours: docs.tours, destinations: docs.destinations, excursions: docs.excursions, vehicles: docs.vehicles };
  const models: Record<string, any> = { tours: Tour, destinations: Destination, excursions: Excursion, vehicles: Vehicle };
  report.archived = {};
  for (const [k, list] of Object.entries(keep)) {
    const slugs = list.map((d) => d.slug);
    const stale = await models[k].find({ slug: { $nin: slugs }, status: { $ne: "archived" } }).select("slug").lean();
    report.archived[k] = stale.map((d: Any) => d.slug);
    if (APPLY && stale.length) await models[k].updateMany({ _id: { $in: stale.map((d: Any) => d._id) } }, { $set: { status: "archived", featured: false } });
  }
}

await connectDatabase();
try {
  await importDestinations();
  await importExcursions();
  await importVehicles();
  await importTours();
  await importGallery();
  await importHero();
  await writeTranslations();
  await archiveStarterContent();
} finally {
  for (const [k, v] of Object.entries(docs)) fs.writeFileSync(path.join(OUT, `${k}.json`), JSON.stringify(v, null, 2));
  fs.writeFileSync(path.join(OUT, "translations.json"), JSON.stringify(translations.map((t) => ({ ...t, source: undefined })), null, 2));
  report.counts = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length]));
  report.translations = translations.length;
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\n", JSON.stringify({ ...report, warnings: report.warnings.length }, null, 2));
  await disconnectDatabase();
}
