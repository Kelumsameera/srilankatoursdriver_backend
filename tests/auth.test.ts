import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { ADMIN, createUserWithRole, getApp, loginAs, seed } from "./helpers/app.js";
import { User } from "../src/models/index.js";

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(stopTestDb);

describe("authentication", () => {
  it("rejects admin APIs without a session", async () => {
    const res = await request(getApp()).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false });
  });

  it("logs in with httpOnly cookies and returns the profile", async () => {
    const res = await request(getApp()).post("/api/auth/login").send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: ADMIN.email, permissions: ["*"] });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith("sltd_at=") && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith("sltd_rt=") && /Path=\/api\/auth/i.test(c))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokens/);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const res = await request(getApp()).post("/api/auth/login").send({ email: ADMIN.email, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
    const unknown = await request(getApp()).post("/api/auth/login").send({ email: "nobody@x.com", password: "wrong" });
    expect(unknown.body.message).toBe("Invalid email or password");
  });

  it("rejects NoSQL operator injection in login", async () => {
    const res = await request(getApp()).post("/api/auth/login").send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("returns the current user from /me", async () => {
    const agent = await loginAs();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.name).toBe("Super Admin");
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const login = await request(getApp()).post("/api/auth/login").send(ADMIN);
    const rt = ([] as string[]).concat(login.headers["set-cookie"]).find((c) => c.startsWith("sltd_rt="))!.split(";")[0];

    const first = await request(getApp()).post("/api/auth/refresh").set("Cookie", rt);
    expect(first.status).toBe(200);
    // Re-using the old (rotated) token is treated as theft → all sessions revoked.
    const reuse = await request(getApp()).post("/api/auth/refresh").set("Cookie", rt);
    expect(reuse.status).toBe(401);
    const newRt = ([] as string[]).concat(first.headers["set-cookie"]).find((c) => c.startsWith("sltd_rt="))!.split(";")[0];
    const afterRevoke = await request(getApp()).post("/api/auth/refresh").set("Cookie", newRt);
    expect(afterRevoke.status).toBe(401);
  });

  it("logs out and clears cookies", async () => {
    const agent = await loginAs();
    const res = await agent.post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(([] as string[]).concat(res.headers["set-cookie"]).some((c) => c.startsWith("sltd_at=;"))).toBe(true);
  });

  it("changing the password revokes other sessions", async () => {
    const user = await createUserWithRole("Editor", "pw-change@test.local");
    const a = await loginAs(user.email, user.password);
    const b = await loginAs(user.email, user.password);
    const res = await a.post("/api/auth/change-password").send({ currentPassword: user.password, newPassword: "BrandNewPassw0rd" });
    expect(res.status).toBe(200);
    expect((await a.get("/api/auth/me")).status).toBe(200); // current session got fresh cookies
    expect((await b.get("/api/auth/me")).status).toBe(401); // other session revoked
  });

  it("locks the account after repeated failures", async () => {
    const user = await createUserWithRole("Editor", "lock@test.local");
    for (let i = 0; i < 5; i++) await request(getApp()).post("/api/auth/login").send({ email: user.email, password: "bad-password" });
    const res = await request(getApp()).post("/api/auth/login").send(user);
    expect(res.status).toBe(423);
  });

  it("suspended users are rejected immediately", async () => {
    const user = await createUserWithRole("Editor", "suspend@test.local");
    const agent = await loginAs(user.email, user.password);
    await User.updateOne({ email: user.email }, { status: "suspended" });
    expect((await agent.get("/api/auth/me")).status).toBe(403);
  });
});

describe("security headers & CORS", () => {
  it("sets helmet headers and hides x-powered-by", async () => {
    const res = await request(getApp()).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejects state-changing requests from foreign origins", async () => {
    const res = await request(getApp()).post("/api/contact").set("Origin", "https://evil.example").send({});
    expect(res.status).toBe(403);
  });
});
