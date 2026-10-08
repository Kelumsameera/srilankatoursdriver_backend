import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * Website visitor account (optional – guests can still book). Kept separate from admin `User`s so a
 * customer session can never reach the admin API, and customers never appear in Admin → Users.
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    /** Absent for accounts created with Google sign-in only. */
    passwordHash: { type: String, select: false },
    googleId: { type: String, select: false, index: { unique: true, sparse: true } },
    avatar: { type: String, default: "" },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    lastLoginAt: Date,
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.googleId;
        delete ret.refreshTokens;
        delete ret.tokenVersion;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type CustomerAttrs = InferSchemaType<typeof customerSchema>;
export type CustomerDocument = HydratedDocument<CustomerAttrs> & { _id: Types.ObjectId };
export const Customer = model("Customer", customerSchema);
