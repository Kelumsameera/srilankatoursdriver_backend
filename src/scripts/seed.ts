/**
 * Idempotent, non-destructive seed: `npm run seed`
 * - Never deletes anything and never overwrites values edited in the admin ($setOnInsert only).
 * - Core records (permissions, roles, first Super Admin, languages, settings, system pages, global SEO)
 *   are created when missing.
 * - Starter content (categories, destinations, excursions, vehicles, tours, FAQs, legal pages, menu, hero)
 *   is only added to a collection that is still empty, so content you deleted or renamed is not
 *   brought back and edited items are not duplicated.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { env, isProduction } from "../config/env.js";
import { passwordPolicy } from "../validations/auth.js";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import {
  BrandSetting,
  Category,
  Destination,
  Excursion,
  FAQ,
  HeroMedia,
  Language,
  NavigationItem,
  Page,
  PageSection,
  Permission,
  Role,
  SeoMetadata,
  SiteSetting,
  Tour,
  User,
  Vehicle,
} from "../models/index.js";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "../config/permissions.js";
import { LOCALE_META, SUPPORTED_LOCALES } from "../config/locales.js";
import { hashPassword } from "../services/auth.service.js";
import { isCloudinaryConfigured, uploadImage } from "../services/cloudinary/index.js";
import { Media } from "../models/Media.js";
import type { CategoryKind } from "../models/Category.js";
import { slugify } from "../utils/helpers.js";
import * as data from "./seed-data.js";

const log = (...args: unknown[]) => console.log("  •", ...args);

export async function seedPermissionsAndRoles() {
  // Insert only the permission records that are missing (existing ones are left untouched).
  const existing = new Set((await Permission.find({}).select("key").lean()).map((p) => p.key));
  const missing = ALL_PERMISSIONS.filter((key) => !existing.has(key)).map((key) => {
    const [module, action] = key.split(":");
    return { key, module, action, description: `${action} ${module}` };
  });
  if (missing.length) await Permission.insertMany(missing, { ordered: false });
  for (const role of DEFAULT_ROLES) {
    // Permission sets edited in Admin → Roles are kept; only missing roles are created.
    // The Super Admin role always keeps the wildcard so the site can never be locked out.
    const isSuper = role.permissions.includes("*");
    await Role.updateOne(
      { name: role.name },
      isSuper
        ? { $set: { permissions: ["*"], isSystem: true }, $setOnInsert: { description: role.description } }
        : { $set: { isSystem: true }, $setOnInsert: { description: role.description, permissions: role.permissions } },
      { upsert: true },
    );
  }
  log(`${ALL_PERMISSIONS.length} permissions, ${DEFAULT_ROLES.length} roles`);
}

export async function seedAdmin() {
  const superRole = await Role.findOne({ name: "Super Admin" });
  if (!superRole) throw new Error("Super Admin role missing");
  if (await User.exists({ role: superRole._id })) {
    log("Super Admin already exists – skipped");
    return null;
  }
  if (!env.SEED_ADMIN_EMAIL) {
    throw new Error("Set SEED_ADMIN_EMAIL (a private address, not the public business e-mail) to create the first Super Admin");
  }
  if (env.SEED_ADMIN_PASSWORD) {
    const check = passwordPolicy.safeParse(env.SEED_ADMIN_PASSWORD);
    if (!check.success) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${check.error.issues.map((i) => i.message).join("; ")}`);
  } else if (isProduction) {
    // Never print a generated credential into production logs.
    throw new Error("Set SEED_ADMIN_PASSWORD (or use `npm run create-admin`) to create the first Super Admin in production");
  }
  const password = env.SEED_ADMIN_PASSWORD ?? `${crypto.randomBytes(9).toString("base64url")}Aa1`;
  await User.create({
    name: env.SEED_ADMIN_NAME,
    email: env.SEED_ADMIN_EMAIL.toLowerCase(),
    role: superRole._id,
    passwordHash: await hashPassword(password),
    status: "active",
  });
  log(`Super Admin created: ${env.SEED_ADMIN_EMAIL}`);
  if (!env.SEED_ADMIN_PASSWORD) {
    console.log(`\n  ⚠  Generated password (shown once – change it after first login): ${password}\n`);
  }
  return password;
}

async function upsert<T>(model: { updateOne: (...a: never[]) => Promise<unknown> }, filter: object, doc: T) {
  await (model.updateOne as unknown as (f: object, u: object, o: object) => Promise<unknown>)(filter, { $setOnInsert: doc }, { upsert: true });
}

async function seedBranding() {
  await upsert(BrandSetting, { key: "default" }, { key: "default", logoAlt: "Sri Lanka Tours Driver logo" });
  const brand = await BrandSetting.findOne({ key: "default" });
  if (brand?.primaryLogo?.url) return log("Logo already set – skipped");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const logoPath = [path.resolve(here, "../../seed-assets/logo.png"), path.resolve(process.cwd(), "seed-assets/logo.png")].find((p) =>
    fs.existsSync(p),
  );
  if (!logoPath) return log("No seed-assets/logo.png – upload the logo in Admin → Branding");
  if (!isCloudinaryConfigured()) return log("Cloudinary not configured – upload the logo later in Admin → Branding");
  const asset = await uploadImage(logoPath, "branding", { originalName: "logo.png" });
  const media = await Media.findOneAndUpdate(
    { publicId: asset.publicId },
    { $set: { ...asset, title: "Sri Lanka Tours Driver logo", altText: "Sri Lanka Tours Driver logo", tags: ["logo"] } },
    { upsert: true, returnDocument: "after" },
  );
  const ref = {
    mediaId: media?._id,
    publicId: asset.publicId,
    url: asset.secureUrl,
    resourceType: "image",
    format: asset.format,
    width: asset.width,
    height: asset.height,
    alt: "Sri Lanka Tours Driver logo",
  };
  brand!.set({ primaryLogo: ref, lightLogo: ref, mobileLogo: ref, logoWidth: 200, logoHeight: 66 });
  await brand!.save();
  log("Uploaded logo to Cloudinary and set it as the primary logo");
}

/** Starter content is only added to collections that are still empty. */
async function isEmpty(model: { exists: (f: object) => Promise<unknown> }, label: string) {
  if (await model.exists({})) {
    log(`${label}: already has data – skipped`);
    return false;
  }
  return true;
}

async function seedCategories() {
  if (!(await isEmpty(Category, "Categories"))) return;
  for (const [i, c] of data.CATEGORIES.entries()) {
    const slug = slugify(c.name);
    await upsert(Category, { kind: c.kind, slug }, { ...c, slug, order: i, enabled: true });
  }
  log(`${data.CATEGORIES.length} categories`);
}

async function catId(kind: string, name: string) {
  const c = await Category.findOne({ kind: kind as CategoryKind, slug: slugify(name) }).select("_id").lean();
  return c?._id;
}

async function seedContent() {
  // Destinations
  if (await isEmpty(Destination, "Destinations")) {
    for (const [i, d] of data.DESTINATIONS.entries()) {
      const { category, ...rest } = d;
      await upsert(Destination, { slug: slugify(d.name) }, { ...rest, slug: slugify(d.name), category: await catId("destination", category), status: "published", order: i + 1 });
    }
    log(`${data.DESTINATIONS.length} destinations`);
  }

  const destIds = async (names: string[]) =>
    (await Destination.find({ slug: { $in: names.map(slugify) } }).select("_id slug").lean())
      .sort((a, b) => names.map(slugify).indexOf(a.slug) - names.map(slugify).indexOf(b.slug))
      .map((d) => d._id);

  if (await isEmpty(Excursion, "Excursions")) {
    for (const [i, e] of data.EXCURSIONS.entries()) {
      const { category, destination, ...rest } = e;
      const [dest] = await destIds([destination]);
      await upsert(Excursion, { slug: slugify(e.title) }, { ...rest, slug: slugify(e.title), category: await catId("excursion", category), destination: dest, status: "published", order: i + 1 });
    }
    log(`${data.EXCURSIONS.length} excursions`);
  }

  if (await isEmpty(Vehicle, "Vehicles")) {
    for (const [i, v] of data.VEHICLES.entries()) {
      const { category, ...rest } = v;
      await upsert(Vehicle, { slug: slugify(v.name) }, { ...rest, slug: slugify(v.name), category: await catId("vehicle", category), airConditioning: true, status: "published", order: i + 1 });
    }
    log(`${data.VEHICLES.length} vehicles`);
  }

  if (await isEmpty(Tour, "Tours")) await seedTours(destIds);

  if (await isEmpty(FAQ, "FAQs")) {
    for (const [i, f] of data.FAQS.entries()) {
      await upsert(FAQ, { question: f.question }, { ...f, status: "published", order: i + 1, featured: i < 4 });
    }
    log(`${data.FAQS.length} FAQs`);
  }
}

async function seedTours(destIds: (names: string[]) => Promise<unknown[]>) {
  const van = await Vehicle.findOne({ slug: "family-van" }).select("_id").lean();
  for (const [i, t] of data.TOURS.entries()) {
    const { category, destinations, ...rest } = t;
    await upsert(
      Tour,
      { slug: slugify(t.title) },
      {
        ...rest,
        slug: slugify(t.title),
        category: await catId("tour", category),
        destinations: await destIds(destinations),
        vehicle: van?._id,
        tourType: "Private chauffeur-guided tour",
        driver: { included: true, languages: ["English"], description: "Your private chauffeur-guide stays with you for the whole journey." },
        status: "published",
        order: i + 1,
      },
    );
  }
  log(`${data.TOURS.length} tours`);
}

async function seedPages() {
  for (const p of data.SYSTEM_PAGES) {
    await upsert(Page, { slug: p.slug }, { slug: p.slug, title: p.title, subtitle: p.subtitle, isSystem: true, status: "published" });
    const page = await Page.findOne({ slug: p.slug });
    if (!page) continue;
    if (p.sections?.length && !(await PageSection.exists({ page: page._id }))) {
      await PageSection.insertMany(p.sections.map((s, i) => ({ ...s, page: page._id, order: i + 1, enabled: true })));
    }
  }
  // Legal pages are starter content: only added while no custom page exists (deleted ones stay deleted).
  if (!(await Page.exists({ isSystem: false }))) {
    for (const p of data.CUSTOM_PAGES) {
      await upsert(Page, { slug: p.slug }, { ...p, isSystem: false, status: "published" });
    }
    log(`${data.CUSTOM_PAGES.length} legal pages`);
  }
  log(`${data.SYSTEM_PAGES.length} system pages`);

  if (!(await HeroMedia.exists({}))) {
    await HeroMedia.create({
      title: "Discover Sri Lanka with your own private driver",
      subtitle: "Tailor-made tours · Airport transfers · Day excursions",
      description: "Ancient kingdoms, misty tea hills, wildlife safaris and golden beaches – explored at your pace.",
      button1: { label: "Explore tours", url: "/tours", variant: "primary" },
      button2: { label: "Plan a tailor-made trip", url: "/tailor-made-tours", variant: "outline" },
      overlay: true,
      overlayOpacity: 0.45,
      order: 1,
      enabled: true,
      featured: true,
    });
    log("Default hero slide (upload a hero image/video in Admin → Hero Media)");
  }
}

export async function seedAll() {
  console.log("Seeding Sri Lanka Tours Driver…");
  await seedPermissionsAndRoles();
  await seedAdmin();
  await Language.bulkWrite(
    SUPPORTED_LOCALES.map((code, i) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, ...LOCALE_META[code], rtl: Boolean(LOCALE_META[code].rtl), enabled: true, order: i } },
        upsert: true,
      },
    })),
  );
  log(`${SUPPORTED_LOCALES.length} languages`);
  await upsert(SiteSetting, { key: "default" }, { key: "default", ...data.SITE_SETTINGS });
  log("Site settings");
  await seedBranding().catch((err: unknown) => log(`Logo upload skipped: ${(err as Error).message}`));
  if (!(await NavigationItem.exists({}))) {
    await NavigationItem.insertMany(data.NAVIGATION.map((n, i) => ({ ...n, order: i + 1, enabled: true })));
  }
  log("Navigation");
  await seedCategories();
  await seedContent();
  await seedPages();
  await upsert(SeoMetadata, { key: "global" }, data.SEO_GLOBAL);
  log("Global SEO");
  console.log("Done.");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  connectDatabase()
    .then(seedAll)
    .then(disconnectDatabase)
    .then(() => process.exit(0))
    .catch(async (err: unknown) => {
      console.error(err);
      await disconnectDatabase().catch(() => undefined);
      process.exit(1);
    });
}
