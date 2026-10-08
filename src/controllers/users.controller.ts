import type { Request, Response } from "express";
import * as users from "../services/users.service.js";
import { logActivity } from "../services/activity.service.js";
import { created, noContent, ok } from "../utils/response.js";
import { ALL_PERMISSIONS, PERMISSION_ACTIONS, PERMISSION_MODULES } from "../config/permissions.js";

type AnyRecord = Record<string, unknown>;

const actor = (req: Request) => ({ id: req.user!.id, permissions: req.user!.permissions });

/** Names of the fields that changed – never their values (passwords are reported as "password"). */
const changedFields = (input: AnyRecord) => Object.keys(input).filter((k) => input[k] !== undefined);

export async function listUsers(req: Request, res: Response) {
  const { items, meta } = await users.listUsers(req.validated?.query as Parameters<typeof users.listUsers>[0]);
  return ok(res, items, "OK", 200, meta);
}

export async function getUser(req: Request, res: Response) {
  return ok(res, await users.getUser(String(req.params.id)));
}

export async function createUser(req: Request, res: Response) {
  const user = await users.createUser(req.validated?.body as Parameters<typeof users.createUser>[0], actor(req));
  await logActivity(req, { action: "create", entity: "user", entityId: String(user._id), summary: `Created user ${user.email}` });
  return created(res, user, "User created");
}

export async function updateUser(req: Request, res: Response) {
  const input = req.validated?.body as AnyRecord;
  const user = await users.updateUser(String(req.params.id), input, actor(req));
  await logActivity(req, { action: "update", entity: "user", entityId: String(user._id), summary: `Updated user ${user.email} (${changedFields(input).join(", ") || "no changes"})` });
  return ok(res, user, "User saved");
}

export async function deleteUser(req: Request, res: Response) {
  const user = await users.deleteUser(String(req.params.id), actor(req));
  await logActivity(req, { action: "delete", entity: "user", entityId: String(user._id), summary: `Deleted user ${user.email}` });
  return noContent(res, "User deleted");
}

export async function listRoles(_req: Request, res: Response) {
  return ok(res, await users.listRoles());
}

export async function listPermissions(_req: Request, res: Response) {
  return ok(res, { modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS, all: ALL_PERMISSIONS, records: await users.listPermissions() });
}

export async function createRole(req: Request, res: Response) {
  const role = await users.createRole(req.validated?.body as Parameters<typeof users.createRole>[0], actor(req));
  await logActivity(req, { action: "create", entity: "role", entityId: String(role._id), summary: `Created role ${role.name}` });
  return created(res, role, "Role created");
}

export async function updateRole(req: Request, res: Response) {
  const input = req.validated?.body as Parameters<typeof users.updateRole>[1];
  const role = await users.updateRole(String(req.params.id), input, actor(req));
  await logActivity(req, {
    action: "update",
    entity: "role",
    entityId: String(role._id),
    summary: `Updated role ${role.name}${input.permissions ? ` (${role.permissions.length} permissions)` : ""}`,
  });
  return ok(res, role, "Role saved");
}

export async function deleteRole(req: Request, res: Response) {
  const role = await users.deleteRole(String(req.params.id), actor(req));
  await logActivity(req, { action: "delete", entity: "role", entityId: String(role._id), summary: `Deleted role ${role.name}` });
  return noContent(res, "Role deleted");
}
