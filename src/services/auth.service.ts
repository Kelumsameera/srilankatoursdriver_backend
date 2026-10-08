import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import type { Model } from "mongoose";
import { cookieSecure, env } from "../config/env.js";
import { User } from "../models/User.js";
import type { RoleAttrs } from "../models/Role.js";
import { ApiError } from "../utils/ApiError.js";
import { sha256 } from "../utils/helpers.js";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "./login-throttle.service.js";

export const ACCESS_COOKIE = "sltd_at";
export const REFRESH_COOKIE = "sltd_rt";
/** The access token is only needed by the API, so browsers don't send it anywhere else on the host. */
const ACCESS_PATH = "/api";
const REFRESH_PATH = "/api/auth";
const MAX_SESSIONS = 10;
/** How long an already-exchanged refresh token is still accepted: covers two tabs refreshing at the same moment. */
export const REFRESH_GRACE_MS = 30_000;
/** Recently exchanged tokens remembered per account (for the grace window and for theft detection). */
const MAX_ROTATED_TOKENS = 50;
const BCRYPT_ROUNDS = 12;
let dummyHash: string | undefined;

interface AccessPayload {
  sub: string;
  tv: number;
  typ: "access";
}
interface RefreshPayload {
  sub: string;
  tv: number;
  jti: string;
  typ: "refresh";
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(userId: string, tokenVersion: number): string {
  const payload: AccessPayload = { sub: userId, tv: tokenVersion, typ: "access" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as AccessPayload;
  if (decoded.typ !== "access") throw new Error("Wrong token type");
  return decoded;
}

function signRefreshToken(userId: string, tokenVersion: number, jti: string): string {
  const payload: RefreshPayload = { sub: userId, tv: tokenVersion, jti, typ: "refresh" };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] }) as RefreshPayload;
  if (decoded.typ !== "refresh") throw new Error("Wrong token type");
  return decoded;
}

/** httpOnly (never readable by JS), Secure per COOKIE_SECURE, SameSite per COOKIE_SAMESITE, optional shared domain. */
export function baseCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

/** Cookie lifetime matches the token's own expiry, so the browser drops it when the JWT is no longer valid. */
export function msUntilExpiry(token: string, fallbackMs: number): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : fallbackMs;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie(), path: ACCESS_PATH, maxAge: msUntilExpiry(accessToken, 15 * 60 * 1000) });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    path: REFRESH_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: ACCESS_PATH });
  // Access cookies issued before the path was narrowed to /api (they expire within ACCESS_TOKEN_TTL).
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_PATH });
}

export interface StoredSession {
  tokenHash: string;
  expiresAt: Date;
  createdAt?: Date;
  userAgent?: string;
  ip?: string;
}

function issueTokens(userId: string, tokenVersion: number, meta: RequestMeta) {
  const jti = crypto.randomUUID();
  const session: StoredSession = {
    tokenHash: sha256(jti),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    userAgent: meta.userAgent ?? "",
    ip: meta.ip ?? "",
  };
  return { session, accessToken: signAccessToken(userId, tokenVersion), refreshToken: signRefreshToken(userId, tokenVersion, jti) };
}

/** Unexpired sessions (minus `drop`), plus `add`, capped at MAX_SESSIONS. */
export function nextSessions(current: StoredSession[] | undefined, opts: { drop?: string; add?: StoredSession }): StoredSession[] {
  const now = Date.now();
  const kept: StoredSession[] = (current ?? [])
    .filter((t) => new Date(t.expiresAt).getTime() > now && t.tokenHash !== opts.drop)
    .map((t) => ({ tokenHash: t.tokenHash, expiresAt: t.expiresAt, createdAt: t.createdAt, userAgent: t.userAgent, ip: t.ip }));
  if (opts.add) kept.push(opts.add);
  return kept.slice(-MAX_SESSIONS);
}

interface SessionRecords {
  refreshTokens?: StoredSession[];
  rotatedTokens?: { tokenHash: string; rotatedAt: Date }[];
}

/**
 * Exchanges the refresh token whose hash is `tokenHash` for the new `session`, on a User or a Customer.
 * Callers have already checked that the account is active and that the token's version is current.
 *
 * What happens depends on where the presented token is found:
 * - among the current sessions: it is replaced by `session`. This is a compare-and-set, so of two
 *   requests racing with the same token only one can succeed here.
 * - among tokens exchanged in the last REFRESH_GRACE_MS: `session` is added as well. This is the request
 *   that lost that race – usually a second browser tab – not a theft.
 * - among tokens exchanged earlier: the token is being replayed, probably stolen, so every session is revoked.
 * - nowhere (logged out, expired, or pushed out by the session limit): rejected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rotateRefreshSession(model: Model<any>, ownerId: string, tokenHash: string, tokenVersion: number, session: StoredSession) {
  const activeAccount = { _id: ownerId, status: "active", tokenVersion };
  const readSessions = () => model.findById(ownerId).select("+refreshTokens +rotatedTokens").lean<SessionRecords>();
  const now = new Date();

  let records = await readSessions();
  const current = records?.refreshTokens ?? [];
  if (current.some((t) => t.tokenHash === tokenHash)) {
    const replaced = await model.updateOne(
      { ...activeAccount, "refreshTokens.tokenHash": tokenHash },
      {
        $set: { refreshTokens: nextSessions(current, { drop: tokenHash, add: session }) },
        $push: { rotatedTokens: { $each: [{ tokenHash, rotatedAt: now }], $slice: -MAX_ROTATED_TOKENS } },
      },
    );
    if (replaced.modifiedCount === 1) return;
    records = await readSessions(); // another request exchanged this token a moment ago
  }

  const exchanged = records?.rotatedTokens?.find((t) => t.tokenHash === tokenHash);
  if (!exchanged) throw new ApiError(401, "Session expired – please sign in again", [], "SESSION_EXPIRED");

  if (now.getTime() - new Date(exchanged.rotatedAt).getTime() <= REFRESH_GRACE_MS) {
    const added = await model.updateOne(activeAccount, { $push: { refreshTokens: { $each: [session], $slice: -MAX_SESSIONS } } });
    if (added.modifiedCount !== 1) throw new ApiError(401, "Session revoked", [], "TOKEN_REVOKED");
    return;
  }

  // Revoke everything, including access tokens still in flight (tokenVersion bump).
  await model.updateOne({ _id: ownerId }, { $set: { refreshTokens: [], rotatedTokens: [] }, $inc: { tokenVersion: 1 } });
  throw new ApiError(401, "Refresh token reuse detected – all sessions revoked", [], "TOKEN_REUSED");
}

/** Creates a new refresh-token session for the user and returns both tokens. */
async function createSession(userId: string, tokenVersion: number, meta: RequestMeta) {
  const { session, accessToken, refreshToken } = issueTokens(userId, tokenVersion, meta);
  const user = await User.findById(userId).select("+refreshTokens");
  if (!user) throw ApiError.unauthorized();
  user.set("refreshTokens", nextSessions(user.refreshTokens as StoredSession[], { add: session }));
  await user.save();
  return { accessToken, refreshToken };
}

export async function login(email: string, password: string, meta: RequestMeta) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash +tokenVersion");

  // Constant-ish time: always run bcrypt even if the user doesn't exist.
  dummyHash ??= await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);
  const hash = user?.passwordHash ?? dummyHash;
  const valid = await verifyPassword(password, hash);

  if (!user) throw ApiError.unauthorized("Invalid email or password");
  const account = `user:${String(user._id)}`;
  const ip = meta.ip ?? "unknown";
  // A locked account answers exactly like a wrong password, so the lock reveals nothing.
  if (await isLoginLocked(account, ip)) throw ApiError.unauthorized("Invalid email or password");
  if (!valid) {
    await recordLoginFailure(account, ip);
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (user.status !== "active") throw ApiError.forbidden("Account is suspended");

  await clearLoginFailures(account, ip);
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await createSession(String(user._id), user.tokenVersion ?? 0, meta);
  return { user, ...tokens };
}

/** Rotates the refresh token (see rotateRefreshSession for how replays and racing tabs are told apart). */
export async function refresh(refreshToken: string | undefined, meta: RequestMeta) {
  if (!refreshToken) throw ApiError.unauthorized("No refresh token");
  let payload: RefreshPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const user = await User.findById(payload.sub).select("+tokenVersion").lean();
  if (!user || user.status !== "active") throw ApiError.unauthorized("Account unavailable");
  if ((user.tokenVersion ?? 0) !== payload.tv) throw new ApiError(401, "Session revoked", [], "TOKEN_REVOKED");

  const { session, accessToken, refreshToken: newRefreshToken } = issueTokens(String(user._id), payload.tv, meta);
  await rotateRefreshSession(User, String(user._id), sha256(payload.jti), payload.tv, session);
  return { user, accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string | undefined): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const hash = sha256(payload.jti);
    const user = await User.findById(payload.sub).select("+refreshTokens").lean();
    if (user) {
      await User.updateOne(
        { _id: user._id, "refreshTokens.tokenHash": hash },
        { $set: { refreshTokens: nextSessions(user.refreshTokens as StoredSession[], { drop: hash }) } },
      );
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, meta: RequestMeta) {
  const user = await User.findById(userId).select("+passwordHash +tokenVersion +refreshTokens");
  if (!user) throw ApiError.notFound("User not found");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest("Current password is incorrect", [{ path: "currentPassword", message: "Incorrect password" }]);
  }
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // revokes all other sessions
  user.set("refreshTokens", []);
  await user.save();
  return createSession(String(user._id), user.tokenVersion, meta);
}

/** Returns a safe, serialisable view of the user with role & permissions. */
export async function getProfile(userId: string) {
  const user = await User.findById(userId).populate<{ role: RoleAttrs & { _id: unknown } }>("role").lean();
  if (!user) throw ApiError.notFound("User not found");
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    role: user.role ? { id: String(user.role._id), name: user.role.name } : null,
    permissions: user.role?.permissions ?? [],
  };
}

export const PREVIEW_TOKEN_MINUTES = 10;

/** Short-lived token allowing the Next.js preview route to render one page's disabled/draft sections. */
export function signPreviewToken(userId: string, pageSlug: string): string {
  return jwt.sign({ sub: userId, typ: "preview", slug: pageSlug }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: `${PREVIEW_TOKEN_MINUTES}m`,
  });
}

/** True only for a valid, unexpired preview token issued for this page. */
export function verifyPreviewToken(token: string, pageSlug: string): boolean {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as { typ?: string; slug?: string };
    return decoded.typ === "preview" && decoded.slug === pageSlug.toLowerCase();
  } catch {
    return false;
  }
}
