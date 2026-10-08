import { describe, expect, it } from "vitest";
import { bookingCreate, tailorMadeCreate, contactCreate } from "../src/validations/crm.js";
import { tourCreate, tourUpdate, guestShortCreate, navigationCreate } from "../src/validations/content.js";
import { siteSettingsUpdate } from "../src/validations/settings.js";
import { passwordPolicy } from "../src/validations/auth.js";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe("booking validation", () => {
  const valid = { type: "general", customer: { name: "Jane Doe", email: "jane@example.com" }, startDate: inDays(30), adults: 2 };

  it("accepts a valid booking", () => {
    expect(bookingCreate.safeParse(valid).success).toBe(true);
  });
  it("rejects past dates, bad email and zero adults", () => {
    const r = bookingCreate.safeParse({ ...valid, startDate: "2001-01-01", adults: 0, customer: { name: "J", email: "x" } });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["adults", "customer.email", "customer.name"]));
  });
  it("rejects end date before start date", () => {
    const r = bookingCreate.safeParse({ ...valid, endDate: inDays(10) });
    expect(r.success).toBe(false);
  });
  it("passes the honeypot through so the service can drop bots silently", () => {
    // A validation error would tell bots which field gave them away; crm.service discards these instead.
    const r = bookingCreate.safeParse({ ...valid, website: "spam" });
    expect(r.success).toBe(true);
    expect(r.data?.website).toBe("spam");
    expect(bookingCreate.safeParse({ ...valid, website: "x".repeat(501) }).success).toBe(false);
  });
});

describe("tailor-made validation", () => {
  const valid = {
    personal: { firstName: "Ann", email: "ann@example.com" },
    travel: { arrivalDate: inDays(40), departureDate: inDays(50) },
    travelers: { adults: 2 },
    hotels: { category: "boutique" },
    interests: ["Culture", "Wildlife"],
  };
  it("accepts a valid enquiry", () => {
    expect(tailorMadeCreate.safeParse(valid).success).toBe(true);
  });
  it("requires departure after arrival", () => {
    const r = tailorMadeCreate.safeParse({ ...valid, travel: { arrivalDate: inDays(50), departureDate: inDays(40) } });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path.join(".")).toBe("travel.departureDate");
  });
  it("requires a valid hotel category", () => {
    expect(tailorMadeCreate.safeParse({ ...valid, hotels: { category: "castle" } }).success).toBe(false);
  });
});

describe("content validation", () => {
  it("requires a title for tours and strips unknown keys", () => {
    expect(tourCreate.safeParse({}).success).toBe(false);
    const r = tourCreate.safeParse({ title: "A tour", hacker: true, status: "published" });
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).hacker).toBeUndefined();
  });
  it("partial updates do not inject defaults", () => {
    const r = tourUpdate.parse({ title: "Only title" });
    expect(Object.keys(r)).toEqual(["title"]);
  });
  it("rejects javascript: URLs in navigation", () => {
    expect(navigationCreate.safeParse({ label: "x", url: "javascript:alert(1)" }).success).toBe(false);
    expect(navigationCreate.safeParse({ label: "x", url: "/tours" }).success).toBe(true);
  });
  it("guest shorts need a URL or an upload", () => {
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube", videoUrl: "https://youtube.com/shorts/abc" }).success).toBe(true);
  });
  it("validates site settings phone and email", () => {
    expect(siteSettingsUpdate.safeParse({ whatsapp: "+94 76 930 0334" }).success).toBe(true);
    expect(siteSettingsUpdate.safeParse({ whatsapp: "call me" }).success).toBe(false);
    expect(siteSettingsUpdate.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("contact requires a meaningful message", () => {
    expect(contactCreate.safeParse({ name: "Al", email: "a@b.co", message: "hi" }).success).toBe(false);
  });
});

describe("password policy", () => {
  it("enforces length and character classes", () => {
    expect(passwordPolicy.safeParse("short1A").success).toBe(false);
    expect(passwordPolicy.safeParse("alllowercase123").success).toBe(false);
    expect(passwordPolicy.safeParse("GoodPassw0rd").success).toBe(true);
  });
});
