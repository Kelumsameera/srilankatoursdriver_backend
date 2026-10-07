import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { getApp, loginAs, seed } from "./helpers/app.js";

let admin: TestAgent;
const api = () => request(getApp());

beforeAll(async () => {
  await startTestDb();
  await seed();
  admin = await loginAs();
});
afterAll(stopTestDb);

const image = (name: string) => ({
  publicId: `srilankatoursdriver/tours/${name}`,
  url: `https://res.cloudinary.com/demo-cloud/image/upload/v1/srilankatoursdriver/tours/${name}.jpg`,
  resourceType: "image",
  width: 1600,
  height: 900,
  alt: name,
});

describe("acceptance: everything is admin-controlled", () => {
  it("Test 1–3 & 10: site name, WhatsApp, email and footer come from settings", async () => {
    const res = await admin.put("/api/admin/site-settings").send({
      siteName: "My New Site",
      whatsapp: "+94 77 123 4567",
      email: "hello@example.com",
      footer: { description: "New footer text", copyright: "© Test" },
    });
    expect(res.status).toBe(200);
    const pub = await api().get("/api/site-settings");
    expect(pub.body.data).toMatchObject({ siteName: "My New Site", whatsapp: "+94 77 123 4567", email: "hello@example.com" });
    expect(pub.body.data.footer.description).toBe("New footer text");
    expect(pub.body.data.footer.columns.length).toBeGreaterThan(0); // partial update kept siblings
    expect(pub.body.data.key).toBeUndefined();
  });

  it("Test 4: logo uploaded in branding is served publicly", async () => {
    const res = await admin.put("/api/admin/branding").send({ primaryLogo: image("logo"), logoAlt: "Logo" });
    expect(res.status).toBe(200);
    const pub = await api().get("/api/branding");
    expect(pub.body.data.primaryLogo.url).toContain("logo.jpg");
    // null removes it
    await admin.put("/api/admin/branding").send({ mobileLogo: null });
    expect((await api().get("/api/branding")).body.data.mobileLogo).toBeUndefined();
  });

  let tourId = "";
  it("Test 5: a new published tour appears publicly; drafts do not", async () => {
    const draft = await admin.post("/api/admin/tours").send({ title: "Secret Draft Tour", status: "draft" });
    expect(draft.status).toBe(201);
    const res = await admin.post("/api/admin/tours").send({
      title: "Wild South Adventure",
      status: "published",
      durationDays: 3,
      heroMedia: image("wild"),
      itinerary: [
        { day: 1, title: "Arrive" },
        { day: 2, title: "Safari" },
        { day: 3, title: "Depart" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("wild-south-adventure");
    tourId = res.body.data._id;
    const list = await api().get("/api/tours?limit=50");
    const titles = list.body.data.map((t: { title: string }) => t.title);
    expect(titles).toContain("Wild South Adventure");
    expect(titles).not.toContain("Secret Draft Tour");
    expect((await api().get(`/api/tours/${draft.body.data.slug}`)).status).toBe(404);
  });

  it("Test 6: editing a tour updates the public detail page", async () => {
    await admin.put(`/api/admin/tours/${tourId}`).send({ shortDescription: "Leopards and beaches" });
    const detail = await api().get("/api/tours/wild-south-adventure");
    expect(detail.status).toBe(200);
    expect(detail.body.data.item.shortDescription).toBe("Leopards and beaches");
    expect(detail.body.data.item.itinerary).toHaveLength(3);
    expect(detail.body.data.item.createdBy).toBeUndefined();
  });

  it("unpublish / duplicate / reorder / delete work", async () => {
    await admin.patch(`/api/admin/tours/${tourId}/status`).send({ status: "draft" });
    expect((await api().get("/api/tours/wild-south-adventure")).status).toBe(404);
    const dup = await admin.post(`/api/admin/tours/${tourId}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.data).toMatchObject({ title: "Wild South Adventure (Copy)", status: "draft", slug: "wild-south-adventure-copy" });
    const reorder = await admin.patch("/api/admin/tours/reorder").send({ items: [{ id: tourId, order: 99 }] });
    expect(reorder.status).toBe(200);
    expect((await admin.get(`/api/admin/tours/${tourId}`)).body.data.order).toBe(99);
    expect((await admin.delete(`/api/admin/tours/${dup.body.data._id}`)).status).toBe(200);
    expect((await admin.get(`/api/admin/tours/${dup.body.data._id}`)).status).toBe(404);
  });

  it("slugs are unique and validated", async () => {
    const a = await admin.post("/api/admin/tours").send({ title: "Same Name" });
    const b = await admin.post("/api/admin/tours").send({ title: "Same Name" });
    expect(a.body.data.slug).toBe("same-name");
    expect(b.body.data.slug).toBe("same-name-2");
    expect((await admin.post("/api/admin/tours").send({ title: "X", slug: "Bad Slug!" })).status).toBe(400);
  });

  it("Test 7: gallery uploads appear in the public gallery", async () => {
    const res = await admin.post("/api/admin/gallery").send({ media: image("beach"), title: "Beach", status: "published" });
    expect(res.status).toBe(201);
    const pub = await api().get("/api/gallery");
    expect(pub.body.data.map((g: { title: string }) => g.title)).toContain("Beach");
  });

  it("Test 8: a new destination appears publicly", async () => {
    const res = await admin.post("/api/admin/destinations").send({ name: "Trincomalee", status: "published", region: "Eastern" });
    expect(res.status).toBe(201);
    const pub = await api().get("/api/destinations/trincomalee");
    expect(pub.body.data.item.region).toBe("Eastern");
  });

  it("Test 9: editing the hero updates the homepage", async () => {
    const list = await admin.get("/api/admin/hero");
    const hero = list.body.data[0];
    await admin.put(`/api/admin/hero/${hero._id}`).send({ title: "Brand new hero title", desktopImage: image("hero") });
    const home = await api().get("/api/pages/home");
    const heroSection = home.body.data.sections.find((s: { type: string }) => s.type === "hero");
    expect(heroSection.data[0].title).toBe("Brand new hero title");
  });

  it("homepage sections can be disabled, reordered, duplicated and previewed", async () => {
    const pages = await admin.get("/api/admin/pages");
    const home = pages.body.data.find((p: { slug: string }) => p.slug === "home");
    const full = await admin.get(`/api/admin/pages/${home._id}`);
    const why = full.body.data.sections.find((s: { type: string }) => s.type === "whyChooseUs");

    await admin.put(`/api/admin/pages/${home._id}/sections/${why._id}`).send({ enabled: false });
    let pub = await api().get("/api/pages/home");
    expect(pub.body.data.sections.some((s: { type: string }) => s.type === "whyChooseUs")).toBe(false);

    // Preview shows disabled sections with a valid token only
    const token = (await admin.post("/api/admin/preview-token")).body.data.token;
    expect((await api().get("/api/preview/pages/home?token=bad")).status).toBe(401);
    const preview = await api().get(`/api/preview/pages/home?token=${token}`);
    expect(preview.body.data.sections.some((s: { type: string }) => s.type === "whyChooseUs")).toBe(true);

    await admin.put(`/api/admin/pages/${home._id}/sections/${why._id}`).send({ enabled: true });
    await admin.patch(`/api/admin/pages/${home._id}/sections/reorder`).send({ items: [{ id: why._id, order: -1 }] });
    pub = await api().get("/api/pages/home");
    expect(pub.body.data.sections[0].type).toBe("whyChooseUs");

    const dup = await admin.post(`/api/admin/pages/${home._id}/sections/${why._id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.data.enabled).toBe(false);
    expect((await admin.delete(`/api/admin/pages/${home._id}/sections/${dup.body.data._id}`)).status).toBe(200);
  });

  it("system pages cannot be deleted; custom pages can", async () => {
    const pages = await admin.get("/api/admin/pages");
    const home = pages.body.data.find((p: { slug: string }) => p.slug === "home");
    expect((await admin.delete(`/api/admin/pages/${home._id}`)).status).toBe(400);
    const custom = await admin.post("/api/admin/pages").send({ slug: "about-us", title: "About us", content: "Hello" });
    expect(custom.status).toBe(201);
    expect((await api().get("/api/pages/about-us")).body.data.page.title).toBe("About us");
    expect((await admin.delete(`/api/admin/pages/${custom.body.data._id}`)).status).toBe(200);
  });

  it("navigation is database driven with nesting", async () => {
    const parent = await admin.post("/api/admin/navigation").send({ label: "More", url: "" });
    await admin.post("/api/admin/navigation").send({ label: "FAQs", url: "/faqs", parent: parent.body.data._id });
    const nav = await api().get("/api/navigation");
    const more = nav.body.data.find((n: { label: string }) => n.label === "More");
    expect(more.children.map((c: { label: string }) => c.label)).toEqual(["FAQs"]);
    await admin.patch(`/api/admin/navigation/${parent.body.data._id}/status`).send({ enabled: false });
    expect((await api().get("/api/navigation")).body.data.some((n: { label: string }) => n.label === "More")).toBe(false);
  });

  it("blog respects draft / scheduled / published", async () => {
    await admin.post("/api/admin/blog").send({ title: "Live post", status: "published", content: "Hello world" });
    await admin.post("/api/admin/blog").send({ title: "Future post", status: "scheduled", publishDate: new Date(Date.now() + 86_400_000 * 5).toISOString() });
    await admin.post("/api/admin/blog").send({ title: "Draft post", status: "draft" });
    const titles = (await api().get("/api/blog")).body.data.map((p: { title: string }) => p.title);
    expect(titles).toEqual(["Live post"]);
  });

  it("reviews: public submissions are pending until approved", async () => {
    const sub = await api()
      .post("/api/reviews")
      .send({ guestName: "Real Guest", email: "g@example.com", rating: 5, review: "A wonderful trip around the island with a great driver." });
    expect(sub.status).toBe(201);
    expect((await api().get("/api/reviews")).body.data).toHaveLength(0);
    const pending = await admin.get("/api/admin/reviews?status=pending");
    await admin.patch(`/api/admin/reviews/${pending.body.data[0]._id}/status`).send({ status: "published" });
    expect((await api().get("/api/reviews")).body.data[0].guestName).toBe("Real Guest");
    expect((await api().get("/api/reviews")).body.data[0].email).toBeUndefined();
  });

  it("FAQs, vehicles, excursions and categories are listed publicly", async () => {
    expect((await api().get("/api/faqs")).body.data.length).toBeGreaterThan(0);
    expect((await api().get("/api/vehicles")).body.data.length).toBeGreaterThan(0);
    expect((await api().get("/api/excursions")).body.data.length).toBeGreaterThan(0);
    expect((await api().get("/api/categories?kind=excursion")).body.data.length).toBe(11);
  });

  it("admin list supports search, filter, sort and pagination", async () => {
    const res = await admin.get("/api/admin/destinations?search=gal&limit=2&page=1&sort=name");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(res.body.data.map((d: { name: string }) => d.name)).toContain("Galle");
    expect((await admin.get("/api/admin/destinations?search=(((")).status).toBe(200); // regex-safe
  });

  it("activity log records changes", async () => {
    const res = await admin.get("/api/admin/activity-logs?limit=100");
    const actions = res.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["login", "create", "update", "delete", "settings_update"]));
  });

  it("dashboard returns counts", async () => {
    const res = await admin.get("/api/admin/dashboard");
    expect(res.body.data.cards.totalDestinations).toBeGreaterThanOrEqual(13);
    expect(res.body.data.bookingsByMonth).toHaveLength(12);
  });

  it("returns consistent 404 JSON for unknown routes", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, errors: [] });
  });
});
