import { Schema, model, Types } from "mongoose";

/**
 * One-time "forgot password" link. Only a SHA-256 hash of the token is stored, so a database leak
 * cannot be used to reset passwords. MongoDB deletes expired documents (TTL index on expiresAt).
 */
const passwordResetSchema = new Schema({
  /** Admins (`User`) and customers (`Customer`) are separate collections. */
  kind: { type: String, enum: ["user", "customer"], required: true },
  account: { type: Types.ObjectId, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  createdAt: { type: Date, default: Date.now },
});

passwordResetSchema.index({ kind: 1, account: 1 });

export const PasswordReset = model("PasswordReset", passwordResetSchema);
