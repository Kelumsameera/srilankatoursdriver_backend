import crypto from "node:crypto";
import type { Types } from "mongoose";
import type { z } from "zod";
import { env, isProduction } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Customer } from "../models/Customer.js";
import { LoginAttempt } from "../models/LoginAttempt.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { customerPassword, passwordPolicy } from "../validations/auth.js";
import { hashPassword } from "./auth.service.js";
import { isEmailConfigured, sendPasswordResetEmail } from "./email/email.service.js";

export const RESET_TTL_MS = 60 * 60 * 1000;

type Kind = "user" | "customer";
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Sends a reset link to every active account (team and/or customer) with this email. Always resolves
 * the same way whether or not an account exists, so the endpoint cannot be used to discover emails.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const [user, customer] = await Promise.all([
    User.findOne({ email, status: "active" }).select("name email").lean(),
    Customer.findOne({ email, status: "active" }).select("name email").lean(),
  ]);
  const accounts: { kind: Kind; id: Types.ObjectId; name: string; email: string }[] = [];
  if (user) accounts.push({ kind: "user", id: user._id, name: user.name, email: user.email });
  if (customer) accounts.push({ kind: "customer", id: customer._id, name: customer.name, email: customer.email });

  for (const a of accounts) {
    const token = crypto.randomBytes(32).toString("base64url");
    // Only the newest link works.
    await PasswordReset.deleteMany({ kind: a.kind, account: a.id });
    await PasswordReset.create({ kind: a.kind, account: a.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    const link = `${env.FRONTEND_URL.replace(/\/$/, "")}/account/reset-password?token=${token}`;
    if (!isEmailConfigured() && !isProduction) logger.warn({ email: a.email, link }, "SMTP not configured – password reset link (development only)");
    // Not awaited: response time must not reveal whether an account exists. sendMail never throws.
    void sendPasswordResetEmail(a.email, a.name, link, a.kind === "user");
  }
}

/** Sets a new password from a reset link and signs the account out everywhere. Returns where to sign in. */
export async function resetPassword(token: string, password: string): Promise<{ kind: Kind }> {
  const tokenHash = hashToken(token);
  const reset = await PasswordReset.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean();
  if (!reset) throw ApiError.badRequest("This reset link is invalid or has expired", [{ path: "token", message: "Invalid or expired link" }]);

  // Team accounts keep the stricter admin password policy.
  const policy: z.ZodType<string> = reset.kind === "user" ? passwordPolicy : customerPassword;
  const check = policy.safeParse(password);
  if (!check.success) throw ApiError.badRequest("Please choose a stronger password", check.error.issues.map((i) => ({ path: "password", message: i.message })));

  // Consume atomically, so a link can be used only once even under concurrent requests.
  const consumed = await PasswordReset.findOneAndDelete({ _id: reset._id });
  if (!consumed) throw ApiError.badRequest("This reset link is invalid or has expired", [{ path: "token", message: "Invalid or expired link" }]);

  const $set: Record<string, unknown> = { passwordHash: await hashPassword(password), refreshTokens: [], rotatedTokens: [] };
  if (reset.kind === "user") $set.passwordChangedAt = new Date();
  // Opening the emailed link proves the customer owns the address.
  else $set.emailVerified = true;
  const model = reset.kind === "user" ? User : Customer;
  const updated = await (model as typeof User).updateOne({ _id: reset.account, status: "active" }, { $set, $inc: { tokenVersion: 1 } });
  if (updated.matchedCount === 0) throw ApiError.badRequest("This reset link is invalid or has expired", [{ path: "token", message: "Invalid or expired link" }]);

  await Promise.all([
    PasswordReset.deleteMany({ kind: reset.kind, account: reset.account }),
    LoginAttempt.deleteMany({ account: `${reset.kind}:${String(reset.account)}` }),
  ]);
  return { kind: reset.kind };
}
