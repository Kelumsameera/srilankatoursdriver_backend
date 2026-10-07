import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { allowedOrigins, env, isTest } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { stripMongoOperators } from "../utils/helpers.js";

const rateLimitHandler = (_req: Request, _res: Response, next: NextFunction) =>
  next(new ApiError(429, "Too many requests, please try again later.", [], "RATE_LIMITED"));

const make = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit: isTest ? 10_000 : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

/** General API limiter. */
export const apiLimiter = make(15 * 60 * 1000, 1500);
/** Login / refresh brute-force protection. */
export const authLimiter = make(15 * 60 * 1000, env.AUTH_RATE_LIMIT);
/** Public form submissions (bookings, enquiries, contact, reviews). */
export const formLimiter = make(60 * 60 * 1000, 20);
/** Media uploads. */
export const uploadLimiter = make(15 * 60 * 1000, 200);

/** Removes `$`-prefixed / dotted keys from the JSON body to block NoSQL operator injection. */
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
