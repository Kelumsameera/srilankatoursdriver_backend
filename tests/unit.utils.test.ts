import { describe, expect, it } from "vitest";
import { escapeRegex, generateReference, slugify, stripMongoOperators, toCsv, setPath } from "../src/utils/helpers.js";
import { extractFields } from "../src/services/translation/registry.js";
import { hasPermission, DEFAULT_ROLES, ALL_PERMISSIONS } from "../src/config/permissions.js";

describe("helpers", () => {
  it("slugify creates URL-safe slugs", () => {
    expect(slugify("Ella & Nine Arches – Day 1!")).toBe("ella-and-nine-arches-day-1");
    expect(slugify("   ")).toBe("item");
  });

  it("escapeRegex neutralises regex metacharacters", () => {
    const rx = new RegExp(escapeRegex("a.*(b)"));
    expect(rx.test("a.*(b)")).toBe(true);
    expect(rx.test("aXXb")).toBe(false);
  });

  it("stripMongoOperators removes operator and prototype keys recursively", () => {
    const input = { email: { $gt: "" }, nested: { ok: 1, $where: "x", "a.b": 1 }, list: [{ $ne: 1, keep: true }], __proto__: { polluted: true } };
    const out = stripMongoOperators(input) as Record<string, unknown>;
    expect(out.email).toEqual({});
    expect(out.nested).toEqual({ ok: 1 });
    expect(out.list).toEqual([{ keep: true }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("toCsv escapes quotes and prevents formula injection", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'He said "hi"', c: { d: 1 } }], [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c.d", label: "D" },
    ]);
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""x"")","He said ""hi""",1`);
  });

  it("generateReference has the expected shape", () => {
    expect(generateReference("B")).toMatch(/^SLTD-B-\d{6}-[A-Z2-9]{5}$/);
  });

  it("setPath only writes into existing structure", () => {
    const obj: Record<string, unknown> = { a: { b: "x" }, list: [{ t: "1" }] };
    setPath(obj, "a.b", "y");
    setPath(obj, "list.0.t", "2");
    setPath(obj, "missing.deep", "z");
    expect(obj).toEqual({ a: { b: "y" }, list: [{ t: "2" }] });
  });
});

describe("translation field extraction", () => {
  it("expands wildcards over arrays and skips empty strings", () => {
    const doc = { title: "Tour", empty: "", itinerary: [{ title: "Day 1", activities: ["Hike", ""] }, { title: "Day 2" }] };
    expect(extractFields(doc, ["title", "empty", "itinerary.*.title", "itinerary.*.activities.*"])).toEqual({
      title: "Tour",
      "itinerary.0.title": "Day 1",
      "itinerary.1.title": "Day 2",
      "itinerary.0.activities.0": "Hike",
    });
  });
});

describe("permissions", () => {
  it("wildcard grants everything", () => {
    expect(hasPermission(["*"], "tours:delete")).toBe(true);
  });
  it("exact match only otherwise", () => {
    expect(hasPermission(["tours:read"], "tours:read")).toBe(true);
    expect(hasPermission(["tours:read"], "tours:delete")).toBe(false);
  });
  it("default roles only reference known permissions", () => {
    for (const role of DEFAULT_ROLES) {
      for (const p of role.permissions) expect(p === "*" || ALL_PERMISSIONS.includes(p)).toBe(true);
    }
  });
  it("Editor cannot delete and Booking Manager cannot edit tours", () => {
    const editor = DEFAULT_ROLES.find((r) => r.name === "Editor")!.permissions;
    const bm = DEFAULT_ROLES.find((r) => r.name === "Booking Manager")!.permissions;
    expect(hasPermission(editor, "tours:delete")).toBe(false);
    expect(hasPermission(editor, "tours:update")).toBe(true);
    expect(hasPermission(bm, "tours:update")).toBe(false);
    expect(hasPermission(bm, "bookings:update")).toBe(true);
  });
});
