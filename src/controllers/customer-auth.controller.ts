import type { NextFunction, Request, Response } from "express";
import * as auth from "../services/customer-auth.service.js";
import { Customer } from "../models/Customer.js";
import { ok, created } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

const meta = (req: Request) => ({ ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) });
const refreshCookie = (req: Request) => (req.cookies as Record<string, string> | undefined)?.[auth.CUSTOMER_REFRESH_COOKIE];

/** Requires a signed-in website customer. Re-checks the account on every request so suspensions apply immediately. */
export async function authenticateCustomer(req: Request, _res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string> | undefined)?.[auth.CUSTOMER_ACCESS_COOKIE];
  if (!token) return next(ApiError.unauthorized());
  let payload: { sub: string; tv: number };
  try {
    payload = auth.verifyCustomerAccessToken(token);
  } catch {
    return next(new ApiError(401, "Session expired", [], "TOKEN_EXPIRED"));
  }
  const customer = await Customer.findById(payload.sub).select("+tokenVersion").lean();
  if (!customer) return next(ApiError.unauthorized("Account not found"));
  if (customer.status !== "active") return next(ApiError.forbidden("Account is suspended"));
  if ((customer.tokenVersion ?? 0) !== payload.tv) return next(new ApiError(401, "Session revoked", [], "TOKEN_REVOKED"));
  req.customer = { id: String(customer._id), email: customer.email };
  next();
}

export async function register(req: Request, res: Response) {
  const body = req.validated?.body as { name: string; email: string; password: string };
  const { customer, accessToken, refreshToken } = await auth.register(body, meta(req));
  auth.setCustomerCookies(res, accessToken, refreshToken);
  return created(res, { user: await auth.getCustomerProfile(String(customer._id)) }, "Account created");
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.validated?.body as { email: string; password: string };
  const { customer, accessToken, refreshToken } = await auth.login(email, password, meta(req));
  auth.setCustomerCookies(res, accessToken, refreshToken);
  return ok(res, { user: await auth.getCustomerProfile(String(customer._id)) }, "Signed in");
}

export async function google(req: Request, res: Response) {
  const { credential } = req.validated?.body as { credential: string };
  const { customer, accessToken, refreshToken } = await auth.loginWithGoogle(credential, meta(req));
  auth.setCustomerCookies(res, accessToken, refreshToken);
  return ok(res, { user: await auth.getCustomerProfile(String(customer._id)) }, "Signed in");
}

export async function refresh(req: Request, res: Response) {
  try {
    const { customer, accessToken, refreshToken } = await auth.refresh(refreshCookie(req), meta(req));
    auth.setCustomerCookies(res, accessToken, refreshToken);
    return ok(res, { user: await auth.getCustomerProfile(String(customer._id)) }, "Session refreshed");
  } catch (err) {
    auth.clearCustomerCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await auth.logout(refreshCookie(req));
  auth.clearCustomerCookies(res);
  return ok(res, null, "Signed out");
}

export async function me(req: Request, res: Response) {
  return ok(res, { user: await auth.getCustomerProfile(req.customer!.id) });
}
