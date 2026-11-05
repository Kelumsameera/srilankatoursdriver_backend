import type { Request, Response } from "express";
import * as auth from "../services/auth.service.js";
import { logActivity } from "../services/activity.service.js";
import { ok } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

const meta = (req: Request) => ({ ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) });
const refreshCookie = (req: Request) => (req.cookies as Record<string, string> | undefined)?.[auth.REFRESH_COOKIE];

export async function login(req: Request, res: Response) {
  const { email, password } = req.validated?.body as { email: string; password: string };
  try {
    const { user, accessToken, refreshToken } = await auth.login(email, password, meta(req));
    auth.setAuthCookies(res, accessToken, refreshToken);
    await logActivity(req, { action: "login", entity: "user", entityId: String(user._id), userId: String(user._id), userEmail: user.email, summary: "Signed in" });
    return ok(res, { user: await auth.getProfile(String(user._id)) }, "Signed in");
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) {
      await logActivity(req, { action: "login_failed", entity: "user", userEmail: email, summary: err.message });
    }
    throw err;
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    const { user, accessToken, refreshToken } = await auth.refresh(refreshCookie(req), meta(req));
    auth.setAuthCookies(res, accessToken, refreshToken);
    return ok(res, { user: await auth.getProfile(String(user._id)) }, "Session refreshed");
  } catch (err) {
    auth.clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const userId = await auth.logout(refreshCookie(req));
  auth.clearAuthCookies(res);
  if (userId) await logActivity(req, { action: "logout", entity: "user", entityId: userId, userId, summary: "Signed out" });
  return ok(res, null, "Signed out");
}

export async function me(req: Request, res: Response) {
  return ok(res, { user: await auth.getProfile(req.user!.id) });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.validated?.body as { currentPassword: string; newPassword: string };
  const tokens = await auth.changePassword(req.user!.id, currentPassword, newPassword, meta(req));
  auth.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  await logActivity(req, { action: "password_change", entity: "user", entityId: req.user!.id, summary: "Changed password (other sessions revoked)" });
  return ok(res, null, "Password changed. Other sessions have been signed out.");
}
