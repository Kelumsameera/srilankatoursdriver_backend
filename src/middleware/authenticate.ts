import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";
import { ACCESS_COOKIE, verifyAccessToken } from "../services/auth.service.js";
import { User } from "../models/User.js";
import type { RoleAttrs } from "../models/Role.js";
import { hasPermission } from "../config/permissions.js";

function extractToken(req: Request): string | undefined {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

/**
 * Verifies the access token, then re-loads the user from MongoDB on every request so that
 * suspensions, role changes and password changes (tokenVersion) take effect immediately.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());

  let payload: { sub: string; tv: number };
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new ApiError(401, "Session expired", [], "TOKEN_EXPIRED"));
  }

  const user = await User.findById(payload.sub).select("+tokenVersion").populate<{ role: RoleAttrs & { _id: unknown } }>("role").lean();
  if (!user) return next(ApiError.unauthorized("Account not found"));
  if (user.status !== "active") return next(ApiError.forbidden("Account is suspended"));
  if ((user.tokenVersion ?? 0) !== payload.tv) return next(new ApiError(401, "Session revoked", [], "TOKEN_REVOKED"));
  if (!user.role) return next(ApiError.forbidden("No role assigned"));

  req.user = {
    id: String(user._id),
    _id: user._id,
    name: user.name,
    email: user.email,
    roleId: String(user.role._id),
    roleName: user.role.name,
    permissions: user.role.permissions ?? [],
  };
  next();
}

/** Requires ALL listed permissions. Must be used after `authenticate`. */
export function requirePermission(...required: string[]) {
  const guard = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const missing = required.filter((p) => !hasPermission(req.user!.permissions, p));
    if (missing.length > 0) return next(ApiError.forbidden(`Missing permission: ${missing.join(", ")}`));
    next();
  };
  // Lets the route-audit test verify that every admin route declares a permission.
  return Object.assign(guard, { requiredPermissions: required });
}
