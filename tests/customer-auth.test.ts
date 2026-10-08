import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";

// Google's token verification is replaced by a fake: "good:<sub>:<email>" is a valid credential.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
      const [kind, sub, email] = idToken.split(":");
      if (kind !== "good" || audience !== process.env.GOOGLE_CLIENT_ID) throw new Error("bad token");
      return { getPayload: () => ({ sub, email, email_verified: true, name: "Google Person", picture: "https://lh3.googleusercontent.com/a" }) };
    }
  },
}));

const { startTestDb, stopTestDb } = await import("./helpers/db.js");
const { ADMIN, getApp, seed } = await import("./helpers/app.js");

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(stopTestDb);

const cookiesOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []);
const PAD = "x".repeat(30);

describe("customer accounts", () => {
  const customer = { name: "Ann Traveller", email: "Ann@Example.com", password: "travel2026" };

  it("registers, sets customer cookies and never leaks secrets", async () => {
    const res = await request(getApp()).post("/api/customer/auth/register").send(customer);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: "Ann Traveller", email: "ann@example.com", hasPassword: true, google: false });
    const cookies = cookiesOf(res);
    expect(cookies.some((c) => c.startsWith("sltd_cat=") && /HttpOnly/i.test(c) && /Path=\/api\/customer/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith("sltd_crt=") && /Path=\/api\/customer\/auth/i.test(c))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokens|googleId/);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const dup = await request(getApp()).post("/api/customer/auth/register").send(customer);
    expect(dup.status).toBe(409);
    const weak = await request(getApp()).post("/api/customer/auth/register").send({ ...customer, email: "b@example.com", password: "short" });
    expect(weak.status).toBe(400);
  });

  it("logs in, reads /me and logs out", async () => {
    const agent = request.agent(getApp());
    const bad = await agent.post("/api/customer/auth/login").send({ email: customer.email, password: "wrongpass1" });
    expect(bad.status).toBe(401);
    expect((await agent.post("/api/customer/auth/login").send({ email: customer.email, password: customer.password })).status).toBe(200);
    const me = await agent.get("/api/customer/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe("ann@example.com");
    await agent.post("/api/customer/auth/logout");
    expect((await agent.get("/api/customer/auth/me")).status).toBe(401);
  });

  it("keeps customer and admin sessions apart", async () => {
    const agent = request.agent(getApp());
    await agent.post("/api/customer/auth/login").send({ email: customer.email, password: customer.password });
    expect((await agent.get("/api/admin/dashboard")).status).toBe(401);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    // Customers can't sign in to the admin, and admins aren't customers.
    expect((await request(getApp()).post("/api/auth/login").send({ email: customer.email, password: customer.password })).status).toBe(401);
    expect((await request(getApp()).post("/api/customer/auth/login").send(ADMIN)).status).toBe(401);
  });

  it("rotates customer refresh tokens and detects reuse", async () => {
    const login = await request(getApp()).post("/api/customer/auth/login").send({ email: customer.email, password: customer.password });
    const rt = cookiesOf(login).find((c) => c.startsWith("sltd_crt="))!.split(";")[0];
    expect((await request(getApp()).post("/api/customer/auth/refresh").set("Cookie", rt)).status).toBe(200);
    expect((await request(getApp()).post("/api/customer/auth/refresh").set("Cookie", rt)).status).toBe(401);
  });

  it("signs in with Google, creating the account and linking an existing email", async () => {
    const created = await request(getApp()).post("/api/customer/auth/google").send({ credential: `good:g-1:new@gmail.com:${PAD}` });
    expect(created.status).toBe(200);
    expect(created.body.data.user).toMatchObject({ email: "new@gmail.com", google: true, hasPassword: false });

    // Google-only accounts have no password to log in with.
    const pw = await request(getApp()).post("/api/customer/auth/login").send({ email: "new@gmail.com", password: "anything1" });
    expect(pw.status).toBe(401);

    const linked = await request(getApp()).post("/api/customer/auth/google").send({ credential: `good:g-2:ann@example.com:${PAD}` });
    expect(linked.status).toBe(200);
    expect(linked.body.data.user).toMatchObject({ email: "ann@example.com", google: true, hasPassword: true });

    const bad = await request(getApp()).post("/api/customer/auth/google").send({ credential: `forged:g-3:x@gmail.com:${PAD}` });
    expect(bad.status).toBe(401);
  });
});
