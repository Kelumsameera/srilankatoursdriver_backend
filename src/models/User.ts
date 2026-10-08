import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from "mongoose";
import { rotatedTokenSchema } from "./schemas/common.js";

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

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    avatar: { type: String, default: "" },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    // No longer used (sign-in throttling lives in LoginAttempt); kept so values in old documents stay hidden.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
    rotatedTokens: { type: [rotatedTokenSchema], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.refreshTokens;
        delete ret.rotatedTokens;
        delete ret.tokenVersion;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttrs> & { _id: Types.ObjectId };
export const User = model("User", userSchema);
