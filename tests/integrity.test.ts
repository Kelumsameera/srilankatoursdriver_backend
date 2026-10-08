import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { getApp, loginAs, seed } from "./helpers/app.js";
import { setTranslationProvider } from "../src/services/translation/providers.js";
import { Category, Destination, Excursion, FAQ, NavigationItem, Page, Role, SeoMetadata, Tour, Translation, User } from "../src/models/index.js";
import { parseEnv } from "../src/config/env.js";

const api = () => request(getApp());

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(stopTestDb);
afterEach(() => setTranslationProvider(null));

/* ───────────────────────── Translations ───────────────────────── */

describe("translation system (English master)", () => {
  it("saves and serves nested and SEO field translations", async () => {
    const admin = await loginAs();
    const tour = await Tour.create({
      title: "Nested tour",
      slug: "nested-tour",
      status: "published",
      itinerary: [{ day: 1, title: "Arrive in Colombo" }],
      seo: { seoTitle: "Nested tour SEO title", metaDescription: "SEO description" },
    });
    const id = String(tour._id);
    const source = (await admin.get(`/api/admin/translations/tour/${id}`)).body.data.source as Record<string, string>;
    expect(Object.keys(source)).toEqual(expect.arrayContaining(["itinerary.0.title", "seo.seoTitle"]));

    const save = await admin.put(`/api/admin/translations/tour/${id}/de`).send({
      fields: { title: "Verschachtelte Tour", "itinerary.0.title": "Ankunft in Colombo", "seo.seoTitle": "SEO-Titel" },
    });
    expect(save.status).toBe(200);
    const stored = (await admin.get(`/api/admin/translations/tour/${id}`)).body.data.locales.de.fields;
    expect(stored).toMatchObject({ "itinerary.0.title": "Ankunft in Colombo", "seo.seoTitle": "SEO-Titel" });

    const pub = (await api().get("/api/tours/nested-tour?locale=de")).body.data.item;
    expect(pub.title).toBe("Verschachtelte Tour");
    expect(pub.itinerary[0].title).toBe("Ankunft in Colombo");
    expect(pub.seo.seoTitle).toBe("SEO-Titel");
  });

  it("records failed machine translations and clears the state on success", async () => {
    const admin = await loginAs();
    const tour = await Tour.create({ title: "Failing tour", slug: "failing-tour", status: "published", shortDescription: "Short" });
    const id = String(tour._id);
    setTranslationProvider({ name: "broken", translate: async () => Promise.reject(new Error("quota exceeded")) });
    const res = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: id, locales: ["fr"] });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ locale: "fr", error: "quota exceeded" });
    let entity = (await admin.get(`/api/admin/translations/tour/${id}`)).body.data.locales.fr;
    expect(entity.state).toBe("failed");
    expect(entity.lastError).toBe("quota exceeded");
    const overview = await admin.get("/api/admin/translations?type=tour");
    const item = overview.body.data.groups[0].items.find((i: { entityId: string }) => i.entityId === id);
    expect(item.locales.fr.state).toBe("failed");
    expect(item.locales.de.state).toBe("missing");
    // English is still served while the translation is missing/failed.
    expect((await api().get("/api/tours/failing-tour?locale=fr")).body.data.item.title).toBe("Failing tour");

    setTranslationProvider({ name: "fake", translate: async (texts: string[], target: string) => texts.map((t) => `[${target}] ${t}`) });
    await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: id, locales: ["fr"] });
    entity = (await admin.get(`/api/admin/translations/tour/${id}`)).body.data.locales.fr;
    expect(entity.state).toBe("up_to_date");
    expect(entity.lastError).toBeNull();
  });

  it("keeps working with TRANSLATION_PROVIDER=none (manual editing only)", async () => {
    const admin = await loginAs();
    const tour = await Tour.findOne({ slug: "failing-tour" }).lean();
    const generate = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: String(tour!._id), locales: ["it"] });
    expect(generate.status).toBe(503);
    const manual = await admin.put(`/api/admin/translations/tour/${tour!._id}/it`).send({ fields: { title: "Tour italiano" } });
    expect(manual.status).toBe(200);
    expect((await api().get("/api/tours/failing-tour?locale=it")).body.data.item.title).toBe("Tour italiano");
  });

  it("source hashes mark edited English fields as outdated and locked rows are untouched", async () => {
    const admin = await loginAs();
    const tour = await Tour.findOne({ slug: "nested-tour" });
    tour!.set("seo.seoTitle", "Changed English SEO title");
    await tour!.save();
    const de = (await admin.get(`/api/admin/translations/tour/${tour!._id}`)).body.data.locales.de;
    expect(de.state).toBe("outdated");
    // The outdated SEO field falls back to English; untouched fields stay translated.
    const pub = (await api().get("/api/tours/nested-tour?locale=de")).body.data.item;
    expect(pub.seo.seoTitle).toBe("Changed English SEO title");
    expect(pub.title).toBe("Verschachtelte Tour");

    await admin.put(`/api/admin/translations/tour/${tour!._id}/de`).send({ locked: true });
    setTranslationProvider({ name: "fake", translate: async (texts: string[]) => texts.map(() => "machine") });
    const gen = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: String(tour!._id), locales: ["de"], force: true });
    expect(gen.body.data[0]).toMatchObject({ skipped: "locked" });
    const row = await Translation.findOne({ entityType: "tour", entityId: tour!._id, locale: "de" }).lean();
    expect(row!.fields instanceof Map ? row!.fields.get("title") : (row!.fields as Record<string, string>).title).toBe("Verschachtelte Tour");
  });
});

/* ───────────────────────── References after deletes ───────────────────────── */

describe("CMS data integrity", () => {
  it("removes references to a deleted destination, category and vehicle", async () => {
    const admin = await loginAs();
    const cat = await Category.create({ kind: "tour", name: "Temp cat", slug: "temp-cat" });
    const dest = await Destination.create({ name: "Temp place", slug: "temp-place", status: "published" });
    const tour = await Tour.create({ title: "Ref tour", slug: "ref-tour", destinations: [dest._id], category: cat._id });
    const exc = await Excursion.create({ title: "Ref excursion", slug: "ref-excursion", destination: dest._id });

    expect((await admin.delete(`/api/admin/destinations/${dest._id}`)).status).toBe(200);
    expect((await Tour.findById(tour._id).lean())!.destinations).toHaveLength(0);
    expect((await Excursion.findById(exc._id).lean())!.destination).toBeUndefined();

    expect((await admin.delete(`/api/admin/categories/${cat._id}`)).status).toBe(200);
    expect((await Tour.findById(tour._id).lean())!.category).toBeUndefined();
  });

  it("menu children move up when their parent is deleted", async () => {
    const admin = await loginAs();
    const parent = await NavigationItem.create({ label: "Parent", url: "/p" });
    const child = await NavigationItem.create({ label: "Child", url: "/c", parent: parent._id });
    expect((await admin.delete(`/api/admin/navigation/${parent._id}`)).status).toBe(200);
    expect((await NavigationItem.findById(child._id).lean())!.parent).toBeNull();
  });

  it("the global SEO defaults cannot be deleted", async () => {
    const admin = await loginAs();
    const global = await SeoMetadata.findOne({ key: "global" }).lean();
    expect((await admin.delete(`/api/admin/seo/${global!._id}`)).status).toBe(400);
    expect(await SeoMetadata.exists({ key: "global" })).toBeTruthy();
  });

  it("slugs stay unique and system page slugs are reserved", async () => {
    const admin = await loginAs();
    const a = await admin.post("/api/admin/tours").send({ title: "Same name" });
    const b = await admin.post("/api/admin/tours").send({ title: "Same name" });
    expect(a.body.data.slug).toBe("same-name");
    expect(b.body.data.slug).toBe("same-name-2");
    expect((await admin.post("/api/admin/pages").send({ slug: "tours", title: "Clash" })).status).toBe(409);
  });
});

/* ───────────────────────── Seed ───────────────────────── */

describe("seed is idempotent and non-destructive", () => {
  it("re-running keeps admin edits, does not duplicate and does not resurrect deleted content", async () => {
    const counts = async () => ({
      tours: await Tour.countDocuments(),
      faqs: await FAQ.countDocuments(),
      categories: await Category.countDocuments(),
      pages: await Page.countDocuments(),
      users: await User.countDocuments(),
      menu: await NavigationItem.countDocuments(),
    });

    // Admin edits: rename an FAQ, delete a seeded tour and a legal page, customise a system role.
    const faq = await FAQ.findOne({}).sort({ order: 1 });
    faq!.set("question", "Edited question text?");
    await faq!.save();
    const victim = await Tour.findOne({ slug: { $nin: ["nested-tour", "failing-tour", "ref-tour", "same-name", "same-name-2"] } });
    await Tour.deleteOne({ _id: victim!._id });
    await Page.deleteOne({ slug: "cookie-policy" });
    await Role.updateOne({ name: "Editor" }, { $set: { permissions: ["dashboard:read", "faqs:read"] } });

    const before = await counts();
    await seed();
    await seed();
    const after = await counts();

    expect(after).toEqual(before);
    expect(await Tour.exists({ slug: victim!.slug })).toBeNull();
    expect(await Page.exists({ slug: "cookie-policy" })).toBeNull();
    expect((await FAQ.findById(faq!._id).lean())!.question).toBe("Edited question text?");
    expect((await Role.findOne({ name: "Editor" }).lean())!.permissions).toEqual(["dashboard:read", "faqs:read"]);
    expect((await Role.findOne({ name: "Super Admin" }).lean())!.permissions).toEqual(["*"]);
    // System pages the site needs are always present.
    expect(await Page.exists({ slug: "home" })).toBeTruthy();
  }, 300_000);
});

/* ───────────────────────── Environment ───────────────────────── */

describe("environment configuration", () => {
  const base = {
    MONGODB_URI: "mongodb://127.0.0.1:27017/x",
    JWT_ACCESS_SECRET: "a".repeat(20) + "access-secret-value-123456",
    JWT_REFRESH_SECRET: "b".repeat(20) + "refresh-secret-value-123456",
  };

  it("accepts localhost development and HTTPS production setups", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development", FRONTEND_URL: "http://localhost:3000" }).success).toBe(true);
    expect(
      parseEnv({
        ...base,
        NODE_ENV: "production",
        FRONTEND_URL: "https://www.srilankatoursdriver.com",
        CORS_ORIGINS: "https://srilankatoursdriver.com, https://admin.srilankatoursdriver.com",
        COOKIE_DOMAIN: ".srilankatoursdriver.com",
        COOKIE_SAMESITE: "none",
        COOKIE_SECURE: "",
        TRUST_PROXY: "1",
      }).success,
    ).toBe(true);
  });

  it("rejects insecure or malformed settings", () => {
    const bad: Record<string, string>[] = [
      { JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET },
      { COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" },
      { COOKIE_DOMAIN: "https://srilankatoursdriver.com" },
      { CORS_ORIGINS: "https://site.com/path" },
      { CORS_ORIGINS: "not a url" },
      { NODE_ENV: "production", JWT_ACCESS_SECRET: "change-me-change-me-change-me-change-me" },
      { NODE_ENV: "production", COOKIE_SECURE: "false" },
      { JWT_ACCESS_SECRET: "short" },
    ];
    for (const override of bad) expect(parseEnv({ ...base, ...override }).success, JSON.stringify(override)).toBe(false);
  });
});
