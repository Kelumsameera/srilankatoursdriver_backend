import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { futureDate, getApp, loginAs, seed } from "./helpers/app.js";
import { Tour } from "../src/models/index.js";

let admin: TestAgent;
const api = () => request(getApp());

beforeAll(async () => {
  await startTestDb();
  await seed();
  admin = await loginAs();
});
afterAll(stopTestDb);

describe("bookings CRM", () => {
  let bookingId = "";

  it("accepts a valid booking for a published tour", async () => {
    const tour = await Tour.findOne({ status: "published" }).lean();
    const res = await api()
      .post("/api/bookings")
      .send({
        type: "tour",
        tour: String(tour!._id),
        customer: { name: "Jane Traveller", email: "jane@example.com", whatsapp: "+44 7700 900123", country: "UK" },
        startDate: futureDate(30),
        endDate: futureDate(37),
        adults: 2,
        children: 1,
        message: "We would love a cooking class.",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^SLTD-B-/);
    bookingId = res.body.data.id;
  });

  it("rejects invalid bookings and non-existent items", async () => {
    expect((await api().post("/api/bookings").send({ customer: { name: "", email: "x" }, adults: 0 })).status).toBe(400);
    const res = await api()
      .post("/api/bookings")
      .send({ type: "tour", tour: "0123456789abcdef01234567", customer: { name: "Ann", email: "ann@example.com" }, startDate: futureDate(5), adults: 1 });
    expect(res.status).toBe(400);
  });

  it("admin can search, filter, update status, assign, add notes and export", async () => {
    const list = await admin.get("/api/admin/bookings?search=jane&status=new");
    expect(list.body.data).toHaveLength(1);
    expect(list.body.statusCounts.new).toBe(1);

    const me = await admin.get("/api/auth/me");
    const upd = await admin.patch(`/api/admin/bookings/${bookingId}`).send({ status: "quoted", quotedAmount: 950, assignedTo: me.body.data.user.id });
    expect(upd.status).toBe(200);
    expect(upd.body.data.statusHistory.map((h: { status: string }) => h.status)).toEqual(["new", "quoted"]);

    const note = await admin.post(`/api/admin/bookings/${bookingId}/notes`).send({ text: "Sent quote via WhatsApp" });
    expect(note.status).toBe(201);
    const detail = await admin.get(`/api/admin/bookings/${bookingId}`);
    expect(detail.body.data.notes[0].text).toBe("Sent quote via WhatsApp");
    expect(detail.body.data.assignedTo.email).toBeDefined();

    expect((await admin.patch(`/api/admin/bookings/${bookingId}`).send({ status: "teleported" })).status).toBe(400);

    const csv = await admin.get("/api/admin/bookings/export");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("Jane Traveller");
  });

  it("admin can delete a booking", async () => {
    expect((await admin.delete(`/api/admin/bookings/${bookingId}`)).status).toBe(200);
    expect((await admin.get(`/api/admin/bookings/${bookingId}`)).status).toBe(404);
  });
});

describe("tailor-made CRM", () => {
  it("stores a multi-step enquiry and computes duration", async () => {
    const dest = (await api().get("/api/destinations?limit=2")).body.data.map((d: { _id: string }) => d._id);
    const res = await api()
      .post("/api/tailor-made-enquiries")
      .send({
        personal: { firstName: "Max", lastName: "Muster", email: "max@example.de", country: "Germany" },
        travel: { arrivalDate: futureDate(60), departureDate: futureDate(74), flexibleDates: true },
        travelers: { adults: 2, children: 2, childAges: "6, 9" },
        arrival: { airport: "CMB", flightNumber: "EK650", time: "03:15" },
        departure: { airport: "CMB" },
        destinations: dest,
        interests: ["Wildlife", "Beach"],
        hotels: { category: "boutique" },
        vehicle: { preference: "Van" },
        budget: { amount: 4000, currency: "EUR", perPerson: false },
        additionalRequirements: "Child seats please",
        locale: "de",
      });
    expect(res.status).toBe(201);
    const list = await admin.get("/api/admin/tailor-made-enquiries");
    expect(list.body.data[0].travel.durationDays).toBe(14);
    expect(list.body.data[0].destinations).toHaveLength(2);

    const id = list.body.data[0]._id;
    expect((await admin.patch(`/api/admin/tailor-made-enquiries/${id}`).send({ status: "processing" })).status).toBe(200);
    expect((await admin.get("/api/admin/tailor-made-enquiries?status=processing")).body.data).toHaveLength(1);
  });

  it("silently discards bot submissions caught by the honeypot", async () => {
    const res = await api()
      .post("/api/tailor-made-enquiries")
      .send({
        personal: { firstName: "Bot", email: "bot@example.com" },
        travel: { arrivalDate: futureDate(10), departureDate: futureDate(12) },
        travelers: { adults: 1 },
        website: "http://spam",
      });
    // Bots get a normal-looking answer (nothing to learn from), but nothing is stored.
    expect(res.status).toBe(201);
    const list = await admin.get("/api/admin/tailor-made-enquiries?search=bot@example.com");
    expect(list.body.data).toHaveLength(0);
  });
});

describe("contact messages", () => {
  it("stores messages and marks them read when opened", async () => {
    expect((await api().post("/api/contact").send({ name: "Lee", email: "lee@example.com", message: "Do you do airport pickups at night?" })).status).toBe(201);
    const list = await admin.get("/api/admin/contact-messages");
    const id = list.body.data[0]._id;
    expect(list.body.data[0].status).toBe("new");
    await admin.get(`/api/admin/contact-messages/${id}`);
    expect((await admin.get("/api/admin/contact-messages")).body.data[0].status).toBe("read");
  });
});
