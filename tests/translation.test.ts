import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { getApp, loginAs, seed } from "./helpers/app.js";
import { setTranslationProvider } from "../src/services/translation/providers.js";
import { Tour } from "../src/models/index.js";

let admin: TestAgent;
const api = () => request(getApp());
let tourId = "";

beforeAll(async () => {
  await startTestDb();
  await seed();
  admin = await loginAs();
  const tour = await Tour.findOne({ status: "published" }).lean();
  tourId = String(tour!._id);
});
afterAll(stopTestDb);
afterEach(() => setTranslationProvider(null));

/** Fake provider: prefixes text with the locale, e.g. "[de] Hello". */
const fake = { name: "fake", translate: async (texts: string[], target: string) => texts.map((t) => `[${target}] ${t}`) };

describe("multilingual CMS", () => {
  it("reports a helpful error when no provider is configured", async () => {
    const res = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: tourId, locales: ["de"] });
    expect(res.status).toBe(503);
  });

  it("generates translations and serves them by locale", async () => {
    setTranslationProvider(fake);
    const res = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: tourId, locales: ["de", "fr"] });
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: { translated: number }) => r.translated > 0)).toBe(true);

    const en = await api().get("/api/tours?locale=en");
    const de = await api().get("/api/tours?locale=de");
    const enTitle = en.body.data.find((t: { _id: string }) => t._id === tourId).title;
    const deTitle = de.body.data.find((t: { _id: string }) => t._id === tourId).title;
    expect(deTitle).toBe(`[de] ${enTitle}`);

    const status = await admin.get("/api/admin/translations?type=tour");
    const item = status.body.data.groups[0].items.find((i: { entityId: string }) => i.entityId === tourId);
    expect(item.locales.de.state).toBe("up_to_date");
    expect(item.locales.ja.state).toBe("missing");
  });

  it("falls back to English for fields edited after translation (outdated)", async () => {
    await admin.put(`/api/admin/tours/${tourId}`).send({ title: "Updated English Title" });
    const de = await api().get("/api/tours?locale=de");
    expect(de.body.data.find((t: { _id: string }) => t._id === tourId).title).toBe("Updated English Title");
    const status = await admin.get("/api/admin/translations?type=tour");
    expect(status.body.data.groups[0].items.find((i: { entityId: string }) => i.entityId === tourId).locales.de.state).toBe("outdated");
  });

  it("manual edits and locks are respected by regeneration", async () => {
    setTranslationProvider(fake);
    const save = await admin.put(`/api/admin/translations/tour/${tourId}/de`).send({ fields: { title: "Mein Titel" }, locked: true });
    expect(save.status).toBe(200);
    const regen = await admin.post("/api/admin/translations/generate").send({ entityType: "tour", entityId: tourId, locales: ["de"], force: true });
    expect(regen.body.data[0].skipped).toBe("locked");
    const de = await api().get("/api/tours?locale=de");
    expect(de.body.data.find((t: { _id: string }) => t._id === tourId).title).toBe("Mein Titel");
  });

  it("unpublished translations are not served", async () => {
    await admin.put(`/api/admin/translations/tour/${tourId}/de`).send({ published: false });
    const de = await api().get("/api/tours?locale=de");
    expect(de.body.data.find((t: { _id: string }) => t._id === tourId).title).toBe("Updated English Title");
  });

  it("ignores unknown fields in manual translations", async () => {
    await admin.put(`/api/admin/translations/tour/${tourId}/fr`).send({ fields: { "__proto__.x": "bad", passwordHash: "nope" } });
    const entity = await admin.get(`/api/admin/translations/tour/${tourId}`);
    expect(Object.keys(entity.body.data.locales.fr.fields)).not.toContain("passwordHash");
  });

  it("translates site settings (footer) per locale", async () => {
    setTranslationProvider(fake);
    const settings = await admin.get("/api/admin/site-settings");
    await admin.post("/api/admin/translations/generate").send({ entityType: "siteSetting", entityId: settings.body.data._id, locales: ["es"] });
    const es = await api().get("/api/site-settings?locale=es");
    expect(es.body.data.businessHours.startsWith("[es] ")).toBe(true);
    expect(es.body.data.phone).toBe(settings.body.data.phone); // non-translatable fields untouched
  });
});
