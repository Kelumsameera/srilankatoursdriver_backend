import { LoginAttempt } from "../models/LoginAttempt.js";

/**
 * Sign-in throttling for admin and customer accounts.
 *
 * A lock applies to one account *from one IP address*, so a stranger who types wrong passwords
 * for the owner's e-mail address locks only themselves out. A much higher account-wide limit
 * still stops a guessing attack spread over many IPs.
 */
export const MAX_FAILURES_PER_IP = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_ACCOUNT = 50;
/** LoginAttempt documents expire after an hour, so no window may be longer than that. */
const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

const since = (ms: number) => new Date(Date.now() - ms);

export async function isLoginLocked(account: string, ip: string): Promise<boolean> {
  const [fromThisIp, fromAnywhere] = await Promise.all([
    LoginAttempt.countDocuments({ account, ip, createdAt: { $gt: since(IP_WINDOW_MS) } }),
    LoginAttempt.countDocuments({ account, createdAt: { $gt: since(ACCOUNT_WINDOW_MS) } }),
  ]);
  return fromThisIp >= MAX_FAILURES_PER_IP || fromAnywhere >= MAX_FAILURES_PER_ACCOUNT;
}

/** Each failure is its own document, so concurrent failures are all counted (no read-modify-write). */
export async function recordLoginFailure(account: string, ip: string): Promise<void> {
  await LoginAttempt.create({ account, ip });
}

/** A successful sign-in clears that IP's failures for the account. */
export async function clearLoginFailures(account: string, ip: string): Promise<void> {
  await LoginAttempt.deleteMany({ account, ip });
}
