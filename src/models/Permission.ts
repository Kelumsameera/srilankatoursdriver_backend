import { Schema, model } from "mongoose";

/** Read-only catalogue of permissions (seeded from config/permissions.ts) used by the Roles UI. */
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Permission = model("Permission", permissionSchema);
