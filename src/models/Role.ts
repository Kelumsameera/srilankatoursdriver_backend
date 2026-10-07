import { Schema, model, type InferSchemaType } from "mongoose";

const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 60 },
    description: { type: String, trim: true, default: "" },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type RoleAttrs = InferSchemaType<typeof roleSchema>;
export const Role = model("Role", roleSchema);
