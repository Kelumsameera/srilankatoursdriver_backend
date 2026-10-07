import { z } from "zod";
import { objectId, shortText } from "./common.js";
import { ALL_PERMISSIONS } from "../config/permissions.js";

export const passwordPolicy = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

export const loginSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordPolicy,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current password",
    path: ["newPassword"],
  });

export const userCreate = z.object({
  name: shortText(120).min(2),
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: passwordPolicy,
  role: objectId,
  status: z.enum(["active", "suspended"]).optional(),
});

export const userUpdate = z
  .object({
    name: shortText(120).min(2),
    email: z.email().max(254).transform((v) => v.toLowerCase()),
    password: passwordPolicy,
    role: objectId,
    status: z.enum(["active", "suspended"]),
  })
  .partial();

const permissionKey = z.string().refine((p) => p === "*" || (ALL_PERMISSIONS as string[]).includes(p), "Unknown permission");

export const roleCreate = z.object({
  name: shortText(60).min(2),
  description: shortText(300).optional(),
  permissions: z.array(permissionKey).max(500),
});
export const roleUpdate = roleCreate.partial();
