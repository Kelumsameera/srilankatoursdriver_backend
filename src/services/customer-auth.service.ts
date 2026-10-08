import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import type { Response } from "express";
import { env } from "../config/env.js";
import { Customer } from "../models/Customer.js";
import { ApiError } from "../utils/ApiError.js";
import { sha256 } from "../utils/helpers.js";
import { baseCookie, hashPassword, msUntilExpiry, nextSessions, verifyPassword, type RequestMeta, type StoredSession } from "./auth.service.js";

/**
 * Customer (website visitor) sessions. Same design as the admin sessions in auth.service.ts – short-lived
 * access JWT + rotating refresh token, both in httpOnly cookies – but with their own cookie names, cookie
 * paths and token types, so an admin token is never accepted here and a customer token never by the admin API.
 */
export const CUSTOMER_ACCESS_COOKIE = "sltd_cat";
export const CUSTOMER_REFRESH_COOKIE = "sltd_crt";
const ACCESS_PATH = "/api/customer";
const REFRESH_PATH = "/api/customer/auth";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
let dummyHash: string | undefined;

interface AccessPayload {
  sub: string;
  tv: number;
  typ: "customer_access";
}
interface RefreshPayload {
  sub: string;
  tv: number;
  jti: string;
  typ: "customer_refresh";
}

export function verifyCustomerAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as AccessPayload;
  if (decoded.typ !== "customer_access") throw new Error("Wrong token type");
  return decoded;
}

function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] }) as RefreshPayload;
  if (decoded.typ !== "customer_refresh") throw new Error("Wrong token type");
  return decoded;
}

function issueTokens(customerId: string, tokenVersion: number, meta: RequestMeta) {
  const jti = crypto.randomUUID();
  const session: StoredSession = {
    tokenHash: sha256(jti),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    userAgent: meta.userAgent ?? "",
    ip: meta.ip ?? "",
  };
  const access: AccessPayload = { sub: customerId, tv: tokenVersion, typ: "customer_access" };
  const refresh: RefreshPayload = { sub: customerId, tv: tokenVersion, jti, typ: "customer_refresh" };
  return {
    session,
    accessToken: jwt.sign(access, env.JWT_ACCESS_SECRET, { algorithm: "HS256", expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"] }),
    refreshToken: jwt.sign(refresh, env.JWT_REFRESH_SECRET, { algorithm: "HS256", expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` }),
  };
}

export function setCustomerCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(CUSTOMER_ACCESS_COOKIE, accessToken, { ...baseCookie(), path: ACCESS_PATH, maxAge: msUntilExpiry(accessToken, 15 * 60 * 1000) });
  res.cookie(CUSTOMER_REFRESH_COOKIE, refreshToken, { ...baseCookie(), path: REFRESH_PATH, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 });
}

export function clearCustomerCookies(res: Response) {
  res.clearCookie(CUSTOMER_ACCESS_COOKIE, { ...baseCookie(), path: ACCESS_PATH });
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_PATH });
}

async function createSession(customerId: string, tokenVersion: number, meta: RequestMeta) {
  const { session, accessToken, refreshToken } = issueTokens(customerId, tokenVersion, meta);
  const customer = await Customer.findById(customerId).select("+refreshTokens");
  if (!customer) throw ApiError.unauthorized();
  customer.set("refreshTokens", nextSessions(customer.refreshTokens as StoredSession[], { add: session }));
  customer.lastLoginAt = new Date();
  await customer.save();
  return { accessToken, refreshToken };
}

export async function register(input: { name: string; email: string; password: string }, meta: RequestMeta) {
  if (await Customer.exists({ email: input.email })) {
    throw ApiError.conflict("An account with this email already exists", [{ path: "email", message: "Email already registered" }]);
  }
  const customer = await Customer.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) });
  const tokens = await createSession(String(customer._id), 0, meta);
  return { customer, ...tokens };
}

export async function login(email: string, password: string, meta: RequestMeta) {
  const customer = await Customer.findOne({ email }).select("+passwordHash +failedLoginAttempts +lockUntil +tokenVersion");

  // Always run bcrypt (also for unknown emails and Google-only accounts) so timing doesn't reveal which exist.
  dummyHash ??= await bcrypt.hash(crypto.randomUUID(), 12);
  const valid = await verifyPassword(password, customer?.passwordHash ?? dummyHash);

  if (!customer || !customer.passwordHash) throw ApiError.unauthorized("Invalid email or password");
  if (customer.lockUntil && customer.lockUntil.getTime() > Date.now()) {
    throw new ApiError(423, "Account temporarily locked after too many failed attempts. Try again later.", [], "LOCKED");
  }
  if (!valid) {
    const attempts = (customer.failedLoginAttempts ?? 0) + 1;
    customer.failedLoginAttempts = attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts;
    if (attempts >= MAX_FAILED_ATTEMPTS) customer.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    await customer.save();
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (customer.status !== "active") throw ApiError.forbidden("Account is suspended");

  customer.failedLoginAttempts = 0;
  customer.lockUntil = undefined;
  await customer.save();
  const tokens = await createSession(String(customer._id), customer.tokenVersion ?? 0, meta);
  return { customer, ...tokens };
}

let googleClient: OAuth2Client | undefined;

/** Verifies a Google Identity Services ID token (signature, expiry, issuer and audience). */
async function verifyGoogleCredential(credential: string) {
  if (!env.GOOGLE_CLIENT_ID) throw ApiError.unavailable("Google sign-in is not configured");
  googleClient ??= new OAuth2Client();
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new Error("Unverified Google account");
    return { googleId: p.sub, email: p.email.toLowerCase(), name: p.name || p.email.split("@")[0], avatar: p.picture ?? "" };
  } catch {
    throw ApiError.unauthorized("Google sign-in failed");
  }
}

/** Signs in with Google, creating the account on first use or linking it to an existing one with the same (Google-verified) email. */
export async function loginWithGoogle(credential: string, meta: RequestMeta) {
  const g = await verifyGoogleCredential(credential);
  let customer = await Customer.findOne({ $or: [{ googleId: g.googleId }, { email: g.email }] }).select("+googleId +tokenVersion");
  if (!customer) {
    customer = await Customer.create({ name: g.name.slice(0, 120), email: g.email, googleId: g.googleId, avatar: g.avatar });
  } else {
    if (customer.googleId && customer.googleId !== g.googleId) throw ApiError.conflict("This email is linked to a different Google account");
    customer.googleId = g.googleId;
    if (!customer.avatar && g.avatar) customer.avatar = g.avatar;
    await customer.save();
  }
  if (customer.status !== "active") throw ApiError.forbidden("Account is suspended");
  const tokens = await createSession(String(customer._id), customer.tokenVersion ?? 0, meta);
  return { customer, ...tokens };
}

/** Rotates the refresh token; replaying an already-rotated token revokes every session (see auth.service.ts). */
export async function refresh(refreshToken: string | undefined, meta: RequestMeta) {
  if (!refreshToken) throw ApiError.unauthorized("No refresh token");
  let payload: RefreshPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const customer = await Customer.findById(payload.sub).select("+tokenVersion +refreshTokens").lean();
  if (!customer || customer.status !== "active") throw ApiError.unauthorized("Account unavailable");
  if ((customer.tokenVersion ?? 0) !== payload.tv) throw new ApiError(401, "Session revoked", [], "TOKEN_REVOKED");

  const hash = sha256(payload.jti);
  const { session, accessToken, refreshToken: newRefreshToken } = issueTokens(String(customer._id), payload.tv, meta);
  const sessions = (customer.refreshTokens ?? []) as StoredSession[];
  const rotated = sessions.some((t) => t.tokenHash === hash)
    ? await Customer.updateOne(
        { _id: customer._id, status: "active", tokenVersion: payload.tv, "refreshTokens.tokenHash": hash },
        { $set: { refreshTokens: nextSessions(sessions, { drop: hash, add: session }) } },
      )
    : null;
  if (!rotated || rotated.modifiedCount !== 1) {
    await Customer.updateOne({ _id: customer._id }, { $set: { refreshTokens: [] }, $inc: { tokenVersion: 1 } });
    throw new ApiError(401, "Refresh token reuse detected – all sessions revoked", [], "TOKEN_REUSED");
  }
  return { customer, accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const hash = sha256(payload.jti);
    const customer = await Customer.findById(payload.sub).select("+refreshTokens").lean();
    if (customer) {
      await Customer.updateOne(
        { _id: customer._id, "refreshTokens.tokenHash": hash },
        { $set: { refreshTokens: nextSessions(customer.refreshTokens as StoredSession[], { drop: hash }) } },
      );
    }
  } catch {
    // Invalid/expired token: nothing to revoke.
  }
}

/** Safe, serialisable view of the customer. */
export async function getCustomerProfile(customerId: string) {
  const c = await Customer.findById(customerId).select("+passwordHash +googleId").lean();
  if (!c) throw ApiError.notFound("Account not found");
  return {
    id: String(c._id),
    name: c.name,
    email: c.email,
    avatar: c.avatar || null,
    hasPassword: !!c.passwordHash,
    google: !!c.googleId,
    createdAt: c.createdAt,
  };
}
