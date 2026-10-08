/**
 * Step 3: homepage sections, transfer-rate table and partner logos taken from the old site (../migrate).
 *
 *   npx tsx migration/zip/scripts/homepage.ts            # dry run – prints what would change, writes nothing
 *   npx tsx migration/zip/scripts/homepage.ts --apply    # uploads the partner logos and updates MongoDB
 *
 * Re-runnable: sections are matched by their internal name, logos by a fixed Cloudinary public id,
 * translations are merged into the existing rows. Social links and contact details are NOT touched.
 *
 *  • Homepage: "Featured Tour Packages (November to April)" = Down South tours, "Seasonal Packages
 *    (May to September)" = East Coast tours, "One Day Tour Packages" = Day Tours, and a "Special offer"
 *    section (created DISABLED – check the price/content and enable it in Admin → Pages → Homepage).
 *    Reviews and gallery switch to the sliding layout.
 *  • Site settings: transfer-rate table (old LKR prices ÷ 300 → USD, like the old site) and partner logos.
 */
import fs from "node:fs";
import path from "node:path";
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { env } from "../../../src/config/env.js";
import { SUPPORTED_LOCALES } from "../../../src/config/locales.js";
import { Category, Media, Page, PageSection, SiteSetting, Translation } from "../../../src/models/index.js";
import { uploadImage } from "../../../src/services/cloudinary/index.js";
import { saveManualTranslation } from "../../../src/services/translation/translation.service.js";

const APPLY = process.argv.includes("--apply");
const SITE = path.resolve("../migrate");
const RAW = path.resolve("migration/zip/raw");
const USD_RATE = 300; // the old site's LKR → USD conversion

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
const raw = (name: string) => JSON.parse(fs.readFileSync(path.join(RAW, `${name}.json`), "utf8"));
const MESSAGES: Record<string, Any> = raw("messages");
const RATES: Record<string, Any[]> = Object.fromEntries(
  Object.entries(raw("packageprices") as Record<string, Any>).map(([l, mod]) => [l, mod[`PACKAGE_PRICES_${l.toUpperCase()}`] as Any[]]),
);
const msg = (locale: string, key: string): string | undefined => key.split(".").reduce<any>((o, k) => o?.[k], MESSAGES[locale]);
const log = (...a: unknown[]) => console.log(APPLY ? "•" : "(dry-run)", ...a);

/* ───────────── homepage sections ───────────── */

interface SectionPlan {
  name: string;
  type: string;
  after: string; // insert after the first existing section of this type
  categorySlug?: string;
  text: { eyebrow?: string; title?: string; badge?: string; subtitle?: string }; // message keys
  extra?: Any;
}

const SECTIONS: SectionPlan[] = [
  {
    name: "Featured tours – Down South (Nov–Apr)",
    type: "popularTours",
    after: "popularTours",
    categorySlug: "down-south-tours",
    text: { eyebrow: "tours.sectionLabel", title: "tours.heading", badge: "tours.season", subtitle: "tours.seasonDesc" },
    extra: { settings: { limit: 3, source: "all", theme: "light", layout: "grid" } },
  },
  {
    name: "Seasonal packages – East Coast (May–Sep)",
    type: "popularTours",
    after: "Featured tours – Down South (Nov–Apr)",
    categorySlug: "east-coast-tours",
    text: { eyebrow: "seasonal.label", title: "seasonal.heading", badge: "seasonal.season", subtitle: "seasonal.description" },
    extra: { settings: { limit: 3, source: "all", theme: "sand", layout: "grid" } },
  },
  {
    name: "One-day tour packages",
    type: "popularTours",
    after: "Seasonal packages – East Coast (May–Sep)",
    categorySlug: "day-tours",
    text: { eyebrow: "tours.luxuryDayTrips", title: "tours.oneDayPackages", subtitle: "tours.oneDayDesc" },
    extra: { settings: { limit: 6, source: "all", theme: "light", layout: "grid" } },
  },
  {
    name: "Special offer (check & enable)",
    type: "offer",
    after: "vehicles",
    text: { eyebrow: "specialOffer.heading" },
    // Content of the old site's offer (English only) – starts disabled so it is reviewed before going live.
    extra: {
      enabled: false,
      title: "10-Day Luxury Sri Lanka Tour",
      badge: "Limited offer – 30% off",
      subtitle:
        "A handcrafted journey through Sri Lanka's most beautiful destinations with private chauffeur, premium hotels and unforgettable experiences.",
      price: "$700",
      priceNote: "For 2 travellers",
      items: [
        { title: "Private A/C luxury vehicle", icon: "check" },
        { title: "Personal English-speaking chauffeur", icon: "check" },
        { title: "4★ & 5★ hotels with breakfast", icon: "check" },
        { title: "All fuel, tolls & parking", icon: "check" },
        { title: "Free tourist SIM card", icon: "star" },
        { title: "Daily premium water bottles", icon: "star" },
        { title: "Scenic train experience", icon: "star" },
      ],
      buttons: [{ label: "Reserve this offer", url: "/contact", variant: "primary" }],
      settings: { theme: "sand", layout: "grid", limit: 6, source: "featured" },
    },
  },
];

const textFor = (plan: SectionPlan, locale: string) =>
  Object.fromEntries(Object.entries(plan.text).map(([field, key]) => [field, msg(locale, key!)]).filter(([, v]) => typeof v === "string" && v));

/** Merges new translated fields into the existing row for that locale (saveManualTranslation replaces all fields). */
async function mergeTranslation(entityType: string, entityId: string, locale: string, fields: Record<string, string>) {
  const existing = await Translation.findOne({ entityType, entityId, locale }).lean();
  const current = Object.fromEntries(Object.entries((existing?.fields as unknown as Record<string, string>) ?? {}).map(([k, v]) => [k.replace(/~/g, "."), v]));
  await saveManualTranslation(entityType, entityId, locale, { fields: { ...current, ...fields } });
}

async function homepage() {
  const page = await Page.findOne({ slug: "home" }).lean();
  if (!page) throw new Error("No 'home' page – run the seed first");
  const existing = await PageSection.find({ page: page._id }).sort({ order: 1 }).lean();
  const ordered: Any[] = existing.map((s) => ({ ...s }));

  for (const plan of SECTIONS) {
    let category: unknown = null;
    if (plan.categorySlug) {
      const cat = await Category.findOne({ kind: "tour", slug: plan.categorySlug }).select("_id name").lean();
      if (!cat) {
        log(`skip "${plan.name}": tour category "${plan.categorySlug}" not found`);
        continue;
      }
      category = cat._id;
    }
    const doc: Any = { page: page._id, type: plan.type, name: plan.name, enabled: true, ...textFor(plan, "en"), ...plan.extra };
    if (category) doc.settings = { ...doc.settings, category };

    const found = ordered.find((s) => s.name === plan.name);
    if (found) {
      log(`update section "${plan.name}"`);
      Object.assign(found, { ...doc, enabled: found.enabled }); // keep the admin's on/off choice on re-runs
      if (APPLY) await PageSection.updateOne({ _id: found._id }, { $set: { ...doc, enabled: found.enabled } });
    } else {
      log(`add section "${plan.name}" (${doc.enabled ? "enabled" : "disabled"})`);
      const created = APPLY ? (await PageSection.create(doc)).toObject() : { ...doc, _id: `new:${plan.name}` };
      const at = ordered.findIndex((s) => s.name === plan.after || (!ordered.some((x) => x.name === plan.after) && s.type === plan.after));
      ordered.splice(at >= 0 ? at + 1 : ordered.length, 0, created);
    }

    // Translated headings from the old site's message files (13 languages).
    const target = ordered.find((s) => s.name === plan.name);
    if (APPLY && target?._id) {
      for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
        const fields = textFor(plan, locale);
        if (Object.keys(fields).length) await mergeTranslation("pageSection", String(target._id), locale, fields as Record<string, string>);
      }
    }
  }

  // Reviews and gallery slide (animated).
  for (const s of ordered.filter((x) => x.type === "reviews" || x.type === "gallery")) {
    if (s.settings?.layout === "carousel") continue;
    log(`${s.type}: layout → sliding`);
    if (APPLY) await PageSection.updateOne({ _id: s._id }, { $set: { "settings.layout": "carousel" } });
  }

  // Renumber so the new sections sit where planned.
  log("section order:\n   " + ordered.map((s, i) => `${i + 1}. ${s.type}${s.name ? ` – ${s.name}` : ""}${s.enabled === false ? " (disabled)" : ""}`).join("\n   "));
  if (APPLY) await PageSection.bulkWrite(ordered.filter((s) => typeof s._id !== "string").map((s, i) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { order: i + 1 } } } })));
}

/* ───────────── site settings: transfer rates + partner logos ───────────── */

const PARTNERS = [
  { name: "Sri Lanka Tourism", url: "https://www.srilanka.travel/", file: "sri-lanka-logo.webp" },
  { name: "Tripadvisor", url: "https://www.tripadvisor.com/", file: "trip-advisor-logo.webp" },
  { name: "SLTDA", url: "https://www.sltda.gov.lk/", file: "sltsm-logo.webp" },
  { name: "PATA", url: "https://www.pata.org/", file: "pata-logo.webp" },
  { name: "TAASL", url: "https://taasl.lk/", file: "taasl-logo.webp" },
];

async function logo(file: string, alt: string): Promise<Any | null> {
  const full = path.join(SITE, "public/images", file);
  if (!fs.existsSync(full)) {
    log(`missing logo ${full}`);
    return null;
  }
  const name = `zip-partner-${file.replace(/\.[a-z0-9]+$/i, "")}`;
  const publicId = `${env.CLOUDINARY_ROOT_FOLDER}/branding/${name}`;
  if (!APPLY) return { publicId, url: `(dry-run) ${file}`, alt };
  let doc = await Media.findOne({ publicId }).lean();
  if (!doc) {
    const asset = await uploadImage(full, "branding", { publicId: name, originalName: file });
    doc = (await Media.findOneAndUpdate(
      { publicId: asset.publicId },
      { $set: { ...asset, altText: alt, title: alt, tags: ["migrated", "partner"] } },
      { upsert: true, returnDocument: "after" },
    ).lean())!;
  }
  return { mediaId: doc._id, publicId: doc.publicId, url: doc.secureUrl, resourceType: "image", format: doc.format, width: doc.width, height: doc.height, alt };
}

async function settings() {
  const s = await SiteSetting.findOne({ key: "default" }).lean();
  if (!s) throw new Error("Site settings missing – run the seed first");

  const rows = (RATES.en ?? []).map((r) => ({
    destination: String(r.destination),
    car: Math.round(Number(r.car) / USD_RATE),
    van: Math.round(Number(r.van) / USD_RATE),
    bus: Math.round(Number(r.bus) / USD_RATE),
    duration: String(r.estimatedDuration ?? ""),
    distanceKm: Number(r.mileageKm) || null,
  }));
  const transferRates = {
    enabled: true,
    currency: "USD",
    title: "",
    subtitle: "",
    note: "* All prices are subject to current exchange rates and include highway tolls where specified.",
    rows,
  };
  log(`transfer rates: ${rows.length} destinations (LKR ÷ ${USD_RATE} → USD), e.g. ${rows[0]?.destination} car $${rows[0]?.car}`);

  const partners = [];
  for (const p of PARTNERS) partners.push({ name: p.name, url: p.url, logo: await logo(p.file, p.name) });
  log(`partners: ${partners.map((p) => p.name + (p.logo ? "" : " (no logo)")).join(", ")}`);

  if (!APPLY) return;
  await SiteSetting.updateOne({ _id: s._id }, { $set: { transferRates, partners } });

  // Destination names / durations in the other 13 languages (row order matches English by id).
  for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
    const loc = RATES[locale];
    if (!loc) continue;
    const fields: Record<string, string> = {};
    (RATES.en ?? []).forEach((r, i) => {
      const lr = loc.find((x) => x.id === r.id);
      if (!lr) return;
      if (lr.destination && lr.destination !== r.destination) fields[`transferRates.rows.${i}.destination`] = String(lr.destination);
      if (lr.estimatedDuration && lr.estimatedDuration !== r.estimatedDuration) fields[`transferRates.rows.${i}.duration`] = String(lr.estimatedDuration);
    });
    if (Object.keys(fields).length) await mergeTranslation("siteSetting", String(s._id), locale, fields);
  }
}

await connectDatabase();
try {
  await homepage();
  await settings();
  console.log(APPLY ? "\nDone." : "\nDry run only – re-run with --apply to write these changes.");
} finally {
  await disconnectDatabase();
}
