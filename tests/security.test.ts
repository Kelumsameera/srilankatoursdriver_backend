import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { ADMIN, createUserWithRole, futureDate, getApp, loginAs, seed } from "./helpers/app.js";
import { adminRouter } from "../src/routes/admin/index.js";
import { ActivityLog, Booking, ContactMessage, Review, Role, Tour, User } from "../src/models/index.js";
import { redactSecrets } from "../src/services/activity.service.js";

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(stopTestDb);

const api = () => request(getApp());
const cookie = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${name}=`));

/* ───────────────────────── RBAC: every admin route is guarded ───────────────────────── */

interface LayerLike {
  name?: string;
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: { requiredPermissions?: string[] } }[] };
  handle: { stack?: LayerLike[]; requiredPermissions?: string[] };
}

function collectRoutes(stack: LayerLike[], out: { route: string; permissions: string[] }[] = []) {
  for (const layer of stack) {
    if (layer.route) {
      const permissions = layer.route.stack.flatMap((l) => l.handle.requiredPermissions ?? []);
      out.push({ route: `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`, permissions });
    } else if (layer.handle.stack) {
      collectRoutes(layer.handle.stack, out);
    }
  }
  return out;
}

describe("RBAC route audit", () => {
  it("authentication runs before every admin route", () => {
    const first = (adminRouter.stack as unknown as LayerLike[])[0];
    expect(first.name).toBe("authenticate");
  });

  it("every admin route declares at least one permission", () => {
    const routes = collectRoutes(adminRouter.stack as unknown as LayerLike[]);
    expect(routes.length).toBeGreaterThan(80);
    const unguarded = routes.filter((r) => r.permissions.length === 0).map((r) => r.route);
    expect(unguarded).toEqual([]);
  });

  it.each([
    ["get", "/api/admin/users"],
    ["get", "/api/admin/roles"],
    ["get", "/api/admin/activity-logs"],
    ["get", "/api/admin/media"],
    ["post", "/api/admin/media/signature"],
    ["get", "/api/admin/bookings"],
    ["get", "/api/admin/tailor-made-enquiries/export"],
    ["put", "/api/admin/site-settings"],
    ["post", "/api/admin/translations/generate"],
    ["get", "/api/admin/system/integrations"],
    ["delete", "/api/admin/guest-shorts/0123456789abcdef01234567"],
  ] as const)("anonymous %s %s → 401", async (method, url) => {
    expect((await api()[method](url)).status).toBe(401);
  });

  it("Editor is denied deletes, settings, users, roles, media deletion and logs", async () => {
    const u = await createUserWithRole("Editor", "sec-editor@test.local");
    const editor = await loginAs(u.email, u.password);
    const tour = await Tour.create({ title: "Editor target", slug: "editor-target" });
    expect((await editor.delete(`/api/admin/tours/${tour._id}`)).status).toBe(403);
    expect((await editor.put("/api/admin/site-settings").send({ siteName: "x" })).status).toBe(403);
    expect((await editor.get("/api/admin/users")).status).toBe(403);
    expect((await editor.post("/api/admin/roles").send({ name: "X", permissions: [] })).status).toBe(403);
    expect((await editor.delete("/api/admin/media/0123456789abcdef01234567")).status).toBe(403);
    expect((await editor.get("/api/admin/activity-logs")).status).toBe(403);
    expect((await editor.patch("/api/admin/navigation/reorder").send({ items: [{ id: String(tour._id), order: 1 }] })).status).toBe(403);
  });
});

/* ───────────────────────── RBAC: privilege escalation ───────────────────────── */

describe("privilege escalation", () => {
  it("a role manager cannot grant permissions they do not hold", async () => {
    const admin = await loginAs();
    const role = await admin.post("/api/admin/roles").send({ name: "People Manager", permissions: ["users:read", "users:create", "users:update", "users:delete", "roles:read", "roles:create", "roles:update", "roles:delete"] });
    expect(role.status).toBe(201);
    const pm = await admin.post("/api/admin/users").send({ name: "People Manager", email: "pm@test.local", password: "GoodPassw0rd", role: role.body.data._id });
    expect(pm.status).toBe(201);
    const agent = await loginAs("pm@test.local", "GoodPassw0rd");

    // Creating a role with more power than they have
    expect((await agent.post("/api/admin/roles").send({ name: "Sneaky", permissions: ["system:update", "settings:update"] })).status).toBe(403);
    // Editing their own role to add permissions
    expect((await agent.put(`/api/admin/roles/${role.body.data._id}`).send({ permissions: ["users:read", "settings:update"] })).status).toBe(403);
    // Editing a more privileged role
    const adminRole = await Role.findOne({ name: "Admin" });
    expect((await agent.put(`/api/admin/roles/${adminRole!._id}`).send({ description: "pwned" })).status).toBe(403);
    // Giving themselves (or a new account) a more powerful role
    const me = await User.findOne({ email: "pm@test.local" });
    expect((await agent.put(`/api/admin/users/${me!._id}`).send({ role: String(adminRole!._id) })).status).toBe(403);
    expect((await agent.post("/api/admin/users").send({ name: "Helper", email: "helper@test.local", password: "GoodPassw0rd", role: String(adminRole!._id) })).status).toBe(403);
    // Touching a Super Admin
    const superAdmin = await User.findOne({ email: ADMIN.email });
    expect((await agent.delete(`/api/admin/users/${superAdmin!._id}`)).status).toBe(403);
    expect((await agent.put(`/api/admin/users/${superAdmin!._id}`).send({ status: "suspended" })).status).toBe(403);
    // …but roles within their own permissions still work
    expect((await agent.post("/api/admin/roles").send({ name: "Viewer", permissions: ["users:read"] })).status).toBe(201);
  });

  it("the default Admin can still manage Editors and Booking Managers", async () => {
    const u = await createUserWithRole("Admin", "sec-admin@test.local");
    const agent = await loginAs(u.email, u.password);
    const editorRole = await Role.findOne({ name: "Editor" });
    const created = await agent.post("/api/admin/users").send({ name: "New Editor", email: "new-editor@test.local", password: "GoodPassw0rd", role: String(editorRole!._id) });
    expect(created.status).toBe(201);
    const bm = await Role.findOne({ name: "Booking Manager" });
    expect((await agent.put(`/api/admin/users/${created.body.data._id}`).send({ role: String(bm!._id) })).status).toBe(200);
    expect((await agent.delete(`/api/admin/users/${created.body.data._id}`)).status).toBe(200);
  });
});

/* ───────────────────────── Authentication & cookies ───────────────────────── */

describe("authentication", () => {
  it("sets httpOnly, SameSite, path-scoped cookies whose lifetime matches the token", async () => {
    const res = await api().post("/api/auth/login").send(ADMIN);
    const at = cookie(res, "sltd_at")!;
    const rt = cookie(res, "sltd_rt")!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\//);
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Path=\/api\/auth/);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(at)?.[1]);
    expect(maxAge).toBeGreaterThan(14 * 60);
    expect(maxAge).toBeLessThanOrEqual(15 * 60);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("refresh-token reuse revokes every session, including live access tokens", async () => {
    const login = await api().post("/api/auth/login").send(ADMIN);
    const at = cookie(login, "sltd_at")!.split(";")[0];
    const rt = cookie(login, "sltd_rt")!.split(";")[0];
    expect((await api().get("/api/auth/me").set("Cookie", at)).status).toBe(200);
    expect((await api().post("/api/auth/refresh").set("Cookie", rt)).status).toBe(200);
    const reuse = await api().post("/api/auth/refresh").set("Cookie", rt);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("TOKEN_REUSED");
    const me = await api().get("/api/auth/me").set("Cookie", at);
    expect(me.status).toBe(401);
    expect(me.body.code).toBe("TOKEN_REVOKED");
  });

  it("only one of two concurrent refreshes with the same token succeeds", async () => {
    const login = await api().post("/api/auth/login").send(ADMIN);
    const rt = cookie(login, "sltd_rt")!.split(";")[0];
    const results = await Promise.all([api().post("/api/auth/refresh").set("Cookie", rt), api().post("/api/auth/refresh").set("Cookie", rt)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("disabled users lose access and cannot refresh", async () => {
    const u = await createUserWithRole("Editor", "sec-suspended@test.local");
    const login = await api().post("/api/auth/login").send(u);
    const at = cookie(login, "sltd_at")!.split(";")[0];
    const rt = cookie(login, "sltd_rt")!.split(";")[0];
    await User.updateOne({ email: u.email }, { status: "suspended" });
    expect((await api().get("/api/admin/tours").set("Cookie", at)).status).toBe(403);
    expect((await api().post("/api/auth/refresh").set("Cookie", rt)).status).toBe(401);
    expect((await api().post("/api/auth/login").send(u)).status).toBe(403);
  });

  it("rejects tampered and wrong-type tokens", async () => {
    const login = await api().post("/api/auth/login").send(ADMIN);
    const at = cookie(login, "sltd_at")!.split(";")[0];
    const rt = cookie(login, "sltd_rt")!.split(";")[0];
    expect((await api().get("/api/auth/me").set("Cookie", `${at}x`)).status).toBe(401);
    // A refresh token presented as an access token (and vice versa) is rejected.
    expect((await api().get("/api/auth/me").set("Cookie", `sltd_at=${rt.split("=")[1]}`)).status).toBe(401);
    expect((await api().post("/api/auth/refresh").set("Cookie", `sltd_rt=${at.split("=")[1]}`)).status).toBe(401);
  });

  it("logout invalidates the refresh token", async () => {
    const login = await api().post("/api/auth/login").send(ADMIN);
    const rt = cookie(login, "sltd_rt")!.split(";")[0];
    expect((await api().post("/api/auth/logout").set("Cookie", rt)).status).toBe(200);
    expect((await api().post("/api/auth/refresh").set("Cookie", rt)).status).toBe(401);
  });
});

/* ───────────────────────── NoSQL injection ───────────────────────── */

describe("NoSQL operator protection", () => {
  it("strips operators from bodies and refuses object-valued query parameters", async () => {
    const login = await api().post("/api/auth/login").send({ email: ADMIN.email, password: { $ne: "x" } });
    expect(login.status).toBe(400);
    const admin = await loginAs();
    // The "simple" query parser never builds objects: "status[$ne]" is just an unknown key and is dropped.
    const all = await admin.get("/api/admin/tours?limit=100");
    const injected = await admin.get("/api/admin/tours?limit=100&status[$ne]=draft");
    expect(injected.status).toBe(200);
    expect(injected.body.meta.total).toBe(all.body.meta.total);
    expect((await api().get("/api/tours?category[$ne]=x")).status).toBe(200);
    // Repeated parameters (arrays) and operator-looking sort keys are rejected outright.
    expect((await admin.get("/api/admin/bookings?status=new&status=confirmed")).status).toBe(400);
    expect((await admin.get("/api/admin/tours?sort=$where")).status).toBe(400);
  });

  it("does not let operator keys reach the database through updates", async () => {
    const admin = await loginAs();
    const tour = await admin.post("/api/admin/tours").send({ title: "Injection target" });
    const res = await admin.put(`/api/admin/tours/${tour.body.data._id}`).send({ $set: { status: "published" }, shortDescription: "safe" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    const search = await admin.get(`/api/admin/tours?search=${encodeURIComponent(".*")}`);
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(0); // regex metacharacters are escaped
  });
});

/* ───────────────────────── Public forms ───────────────────────── */

describe("public forms", () => {
  const booking = () => ({ type: "general", customer: { name: "Dup Guest", email: "dup@example.com" }, startDate: futureDate(30), adults: 2, message: "Airport pickup please" });

  it("validates input and limits", async () => {
    expect((await api().post("/api/bookings").send({ ...booking(), adults: 0 })).status).toBe(400);
    expect((await api().post("/api/bookings").send({ ...booking(), customer: { name: "A", email: "not-an-email" } })).status).toBe(400);
    expect((await api().post("/api/bookings").send({ ...booking(), startDate: futureDate(5000) })).status).toBe(400);
    expect((await api().post("/api/bookings").send({ ...booking(), message: "x".repeat(3001) })).status).toBe(400);
    expect((await api().post("/api/contact").send({ name: "Lee", email: "lee@example.com", message: "short" })).status).toBe(400);
    const tm = await api()
      .post("/api/tailor-made-enquiries")
      .send({ personal: { firstName: "Long", email: "long@example.com" }, travel: { arrivalDate: futureDate(10), departureDate: futureDate(500) }, travelers: { adults: 1 } });
    expect(tm.status).toBe(400);
  });

  it("returns safe, structured errors", async () => {
    const res = await api().post("/api/bookings").set("content-type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Malformed JSON body", errors: [], code: "BAD_REQUEST" });
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|\/home\//);
  });

  it("does not store the same submission twice", async () => {
    const first = await api().post("/api/bookings").send(booking());
    const second = await api().post("/api/bookings").send(booking());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.reference).toBe(first.body.data.reference);
    expect(await Booking.countDocuments({ "customer.email": "dup@example.com" })).toBe(1);

    const msg = { name: "Dup", email: "dup@example.com", message: "Is the airport transfer included?" };
    await api().post("/api/contact").send(msg);
    await api().post("/api/contact").send(msg);
    expect(await ContactMessage.countDocuments({ email: "dup@example.com" })).toBe(1);

    const review = { guestName: "Dup Guest", email: "dup@example.com", rating: 5, review: "Wonderful driver, great tour, would book again." };
    await api().post("/api/reviews").send(review);
    await api().post("/api/reviews").send(review);
    expect(await Review.countDocuments({ guestName: "Dup Guest" })).toBe(1);
  });

  it("discards honeypot submissions without telling the bot", async () => {
    const res = await api().post("/api/contact").send({ name: "Bot", email: "bot@example.com", message: "Buy cheap things here now", website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(await ContactMessage.countDocuments({ email: "bot@example.com" })).toBe(0);
    const rev = await api().post("/api/reviews").send({ guestName: "Bot", email: "bot@example.com", rating: 5, review: "Spam spam spam spam spam spam", website: "x" });
    expect(rev.status).toBe(201);
    expect(await Review.countDocuments({ guestName: "Bot" })).toBe(0);
  });

  it("public reviews always land as pending and unverified", async () => {
    await api().post("/api/reviews").send({ guestName: "Sneaky", email: "s@example.com", rating: 5, review: "Trying to publish myself directly here.", status: "published", verified: true });
    const r = await Review.findOne({ guestName: "Sneaky" }).lean();
    expect(r).toMatchObject({ status: "pending", verified: false, platform: "website" });
  });
});

/* ───────────────────────── Errors & audit log ───────────────────────── */

describe("error output and activity logs", () => {
  it("never leaks internals, paths or Cloudinary account details in production", async () => {
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { env } = await import("../src/config/env.js");
    const run = (err: unknown) => {
      const out: { body?: unknown; status?: number } = {};
      const res = { status: (s: number) => ((out.status = s), res), json: (b: unknown) => ((out.body = b), res) } as unknown as Parameters<typeof errorHandler>[2];
      errorHandler(err, { originalUrl: "/x" } as Parameters<typeof errorHandler>[1], res, () => undefined);
      return out;
    };
    const dbError = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:27017 at /srv/app/node_modules/mongodb/lib/x.js"), { stack: "Error: at /srv/app/x.js:1:1" });
    const cloudError = { http_code: 401, message: "Invalid api_key 123456789012345" };
    const saved = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = "production";
    try {
      const a = run(dbError);
      expect(a.status).toBe(500);
      expect(a.body).toEqual({ success: false, message: "Something went wrong", errors: [], code: "INTERNAL" });
      const b = run(cloudError);
      expect(b.status).toBe(502);
      expect(JSON.stringify(b.body)).not.toContain("123456789012345");
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = saved;
    }
    // Outside production the message helps debugging, but never includes a stack trace.
    expect(JSON.stringify(run(dbError).body)).not.toContain("x.js:1:1");
  });

  it("logs admin mutations without passwords or tokens", async () => {
    const admin = await loginAs();
    const editorRole = await Role.findOne({ name: "Editor" });
    const created = await admin.post("/api/admin/users").send({ name: "Audit Me", email: "audit@test.local", password: "SecretPassw0rd1", role: String(editorRole!._id) });
    await admin.put(`/api/admin/users/${created.body.data._id}`).send({ password: "AnotherPassw0rd2" });
    const logs = await ActivityLog.find({ entity: "user", entityId: created.body.data._id }).lean();
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["create", "update"]));
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain("SecretPassw0rd1");
    expect(dump).not.toContain("AnotherPassw0rd2");
    expect(dump).toContain("password"); // the *fact* that the password changed is recorded
    expect(redactSecrets("token=abc123 password: hunter2 Bearer abcdefghijklmnopqrstuvwxyz eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijklmnop")).not.toMatch(
      /abc123|hunter2|abcdefghijklmnopqrstuvwxyz|eyJhbGci/,
    );
  });
});
