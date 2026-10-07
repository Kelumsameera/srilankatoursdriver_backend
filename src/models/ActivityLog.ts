import { Schema, model } from "mongoose";

export const ACTIVITY_ACTIONS = [
  "login",
  "logout",
  "login_failed",
  "create",
  "update",
  "delete",
  "publish",
  "unpublish",
  "reorder",
  "media_upload",
  "media_delete",
  "settings_update",
  "password_change",
  "translate",
  "export",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

const activityLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    userEmail: { type: String, default: "" },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true, index: true },
    entity: { type: String, default: "", index: true },
    entityId: { type: String, default: "" },
    summary: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

activityLogSchema.index({ timestamp: -1 });

export const ActivityLog = model("ActivityLog", activityLogSchema);
