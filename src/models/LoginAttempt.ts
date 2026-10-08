import { Schema, model } from "mongoose";

/**
 * One failed sign-in, used by login-throttle.service.ts. MongoDB deletes these after an hour (TTL index),
 * which must stay at least as long as the longest window counted there.
 */
const loginAttemptSchema = new Schema({
  /** "user:<id>" or "customer:<id>" – admins and customers are separate collections. */
  account: { type: String, required: true },
  ip: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 },
});

loginAttemptSchema.index({ account: 1, ip: 1, createdAt: -1 });
loginAttemptSchema.index({ account: 1, createdAt: -1 });

export const LoginAttempt = model("LoginAttempt", loginAttemptSchema);
