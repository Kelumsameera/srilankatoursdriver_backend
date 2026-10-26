import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/rate-limit-test";
process.env.JWT_ACCESS_SECRET = "a".repeat(40);
process.env.JWT_REFRESH_SECRET = "b".repeat(40);
process.env.API_PROXY_SECRET = "c".repeat(40);
process.env.REVALIDATE_SECRET = "d".repeat(40);
const { trustedProxyClientIp, isTrustedContentRead, createRateLimiter } = await import("../src/middleware/security.js");

function request(path: string, secret?: string, ip?: string, method = "GET") {
  const req = {
    originalUrl: path, method,
    headers: { ...(secret ? { "x-revalidate-secret": secret } : {}), ...(ip ? { "x-sltd-proxy-secret": "c".repeat(40), "x-sltd-client-ip": ip } : {}) },
  } as Request;
  trustedProxyClientIp(req, {} as Response, () => {});
  assert.equal(req.headers["x-sltd-proxy-secret"], undefined);
  assert.equal(req.headers["x-revalidate-secret"], undefined);
  return req;
}

test("only authenticated server public-content GETs skip the shared limiter", () => {
  const secret = "d".repeat(40);
  for (const path of ["/api/pages/home?locale=en", "/api/tours/a-tour", "/api/languages", "/api/destinations/kandy/nearby"]) {
    assert.equal(isTrustedContentRead(request(path, secret)), true);
    assert.equal(isTrustedContentRead(request(path)), false);
    assert.equal(isTrustedContentRead(request(path, "incorrect")), false);
    assert.equal(isTrustedContentRead(request(path, undefined, "203.0.113.1")), false);
    assert.equal(isTrustedContentRead(request(path, "c".repeat(40))), false);
    assert.equal(isTrustedContentRead(request(path, secret, undefined, "POST")), false);
  }
  for (const path of ["/api/admin/tours", "/api/auth/login", "/api/customer/me", "/api/preview/pages/home", "/api/bookings", "/api/tours-admin"]) {
    assert.equal(isTrustedContentRead(request(path, secret)), false);
  }
});

test("trusted CMS reads do not consume the visitor budget; other calls still reach the limit", async () => {
  const app = express();
  app.use(trustedProxyClientIp);
  app.use("/api", createRateLimiter(60_000, 1, isTrustedContentRead));
  app.use((_req, res) => { res.sendStatus(200); });
  app.use((err: { statusCode: number }, _req: Request, res: Response, _next: unknown) => { res.sendStatus(err.statusCode); });
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/api/pages/home`, { headers: { "x-revalidate-secret": "d".repeat(40) } });
      assert.equal(res.status, 200);
      await res.text();
    }
    for (const expected of [200, 429]) {
      const res = await fetch(`${base}/api/pages/home`);
      assert.equal(res.status, expected);
      await res.text();
    }
    const res = await fetch(`${base}/api/admin/tours`, { headers: { "x-revalidate-secret": "d".repeat(40) } });
    assert.equal(res.status, 429);
    await res.text();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
