import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { allowedOrigins, env, isTest } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { stripMongoOperators } from "../utils/helpers.js";

const rateLimitHandler = (_req: Request, _res: Response, next: NextFunction) =>
  next(new ApiError(429, "Too many requests, please try again later.", [], "RATE_LIMITED"));

/** A per-IP rate limiter. Exported so tests can exercise real limits. */
export const createRateLimiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

// The test suite sends hundreds of requests from one IP, so the shared limiters are effectively off there.
const make = (windowMs: number, limit: number) => createRateLimiter(windowMs, isTest ? 10_000 : limit);

/** General API limiter. */
export const apiLimiter = make(15 * 60 * 1000, 1500);
/** Login / refresh brute-force protection. */
export const authLimiter = make(15 * 60 * 1000, env.AUTH_RATE_LIMIT);
/** Customer register / login / refresh – a separate budget so visitors can't lock admins out (and vice versa). */
export const customerAuthLimiter = make(15 * 60 * 1000, env.AUTH_RATE_LIMIT);
/** Forgot / reset password: each request can send an email, so keep it tight. */
export const passwordResetLimiter = make(60 * 60 * 1000, 10);
/** Public form submissions (bookings, enquiries, contact, reviews). */
export const formLimiter = make(60 * 60 * 1000, 20);
/** Media uploads. */
export const uploadLimiter = make(15 * 60 * 1000, 200);

let warnedAboutProxy = false;

/**
 * Logs once when a request arrives through a proxy Express has not been told to trust. Without
 * TRUST_PROXY every visitor shares the proxy's IP, so all rate limits become one global bucket.
 */
export function warnOnUntrustedProxy(req: Request, _res: Response, next: NextFunction) {
  if (!warnedAboutProxy && !env.TRUST_PROXY && req.headers["x-forwarded-for"]) {
    warnedAboutProxy = true;
    logger.warn("Request has an X-Forwarded-For header but TRUST_PROXY is 0 – rate limits and logs see the proxy's IP. Set TRUST_PROXY to the number of proxies in front of the API.");
  }
  next();
}

export const PROXY_SECRET_HEADER = "x-sltd-proxy-secret";
export const PROXY_CLIENT_IP_HEADER = "x-sltd-client-ip";

const digest = (value: string) => createHash("sha256").update(value).digest();
const expectedProxySecret = env.API_PROXY_SECRET ? digest(env.API_PROXY_SECRET) : null;

/**
 * Requests forwarded by the frontend's /api proxy (Vercel) arrive from Vercel's addresses, so every visitor
 * would share one rate-limit bucket. The proxy therefore sends the visitor's IP together with
 * API_PROXY_SECRET; only when the secret matches does that IP become `req.ip` (rate limits, login throttling,
 * sessions, activity log). Without it the header is ignored, so callers cannot choose their own IP and
 * TRUST_PROXY keeps counting only the proxies directly in front of the API.
 */
export function trustedProxyClientIp(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers[PROXY_SECRET_HEADER];
  const ip = req.headers[PROXY_CLIENT_IP_HEADER];
  if (expectedProxySecret && typeof secret === "string" && typeof ip === "string" && isIP(ip) && timingSafeEqual(digest(secret), expectedProxySecret)) {
    Object.defineProperty(req, "ip", { value: ip, configurable: true, enumerable: true });
  }
  // Never log or pass the secret further down.
  delete req.headers[PROXY_SECRET_HEADER];
  next();
}

/** Removes `$`-prefixed keys (and prototype-polluting keys) from the JSON body to block NoSQL operator injection. */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") req.body = stripMongoOperators(req.body);
  next();
}

/**
 * CSRF defence-in-depth for cookie-authenticated, state-changing requests:
 * reject cross-site Origins that are not on the allow-list.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, server-to-server) don't send Origin
  if (allowedOrigins.includes(origin.replace(/\/$/, ""))) return next();
  next(ApiError.forbidden("Origin not allowed"));
}
