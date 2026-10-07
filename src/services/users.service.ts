import { Permission, Role, User } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId, escapeRegex } from "../utils/helpers.js";
import { hashPassword } from "./auth.service.js";

type AnyRecord = Record<string, unknown>;

async function superAdminRoleId() {
  const role = await Role.findOne({ permissions: "*" }).select("_id").lean();
  return role ? String(role._id) : null;
}

/** Prevents removing the last active Super Admin (would lock everyone out of roles/security). */
async function assertNotLastSuperAdmin(userId: string, change: { role?: string; status?: string; deleting?: boolean }) {
  const superId = await superAdminRoleId();
  if (!superId) return;
  const user = await User.findById(userId).select("role status").lean();
  if (!user || String(user.role) !== superId) return;
  const losing = change.deleting || (change.role && change.role !== superId) || change.status === "suspended";
  if (!losing) return;
  const others = await User.countDocuments({ _id: { $ne: userId }, role: superId, status: "active" });
  if (others === 0) throw ApiError.badRequest("At least one active Super Admin must remain");
}

export async function listUsers(q: { page: number; limit: number; search?: string; status?: string }) {
  const filter: AnyRecord = {};
  if (q.status) filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).populate("role", "name").sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function getUser(id: string) {
  assertObjectId(id);
  const user = await User.findById(id).populate("role", "name").lean();
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function createUser(input: { name: string; email: string; password: string; role: string; status?: string }, actorPermissions: string[]) {
  const role = await Role.findById(input.role).lean();
  if (!role) throw ApiError.badRequest("Role not found");
  if (role.permissions.includes("*") && !actorPermissions.includes("*")) throw ApiError.forbidden("Only a Super Admin can create Super Admins");
  if (await User.exists({ email: input.email })) throw ApiError.conflict("A user with this email already exists");
  const user = await User.create({
    name: input.name,
    email: input.email,
    role: input.role,
    status: (input.status ?? "active") as "active" | "suspended",
    passwordHash: await hashPassword(input.password),
  });
  return user.toJSON();
}

export async function updateUser(id: string, input: AnyRecord, actor: { id: string; permissions: string[] }) {
  assertObjectId(id);
  const user = await User.findById(id).select("+tokenVersion");
  if (!user) throw ApiError.notFound("User not found");
  if (input.role) {
    const role = await Role.findById(input.role).lean();
    if (!role) throw ApiError.badRequest("Role not found");
    if (role.permissions.includes("*") && !actor.permissions.includes("*")) throw ApiError.forbidden("Only a Super Admin can grant Super Admin");
  }
  const current = await Role.findById(user.role).lean();
  if (current?.permissions.includes("*") && !actor.permissions.includes("*")) throw ApiError.forbidden("Only a Super Admin can edit a Super Admin");
  if (id === actor.id && input.status === "suspended") throw ApiError.badRequest("You cannot suspend your own account");
  await assertNotLastSuperAdmin(id, { role: input.role as string | undefined, status: input.status as string | undefined });

  if (input.email && input.email !== user.email && (await User.exists({ email: input.email, _id: { $ne: id } }))) {
    throw ApiError.conflict("A user with this email already exists");
  }
  const { password, ...rest } = input;
  user.set(rest);
  if (typeof password === "string") {
    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
  }
  // Any security-relevant change invalidates the user's existing sessions.
  if (password || input.role || input.status === "suspended") {
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.set("refreshTokens", []);
  }
  await user.save();
  return user.toJSON();
}

export async function deleteUser(id: string, actorId: string) {
  assertObjectId(id);
  if (id === actorId) throw ApiError.badRequest("You cannot delete your own account");
  await assertNotLastSuperAdmin(id, { deleting: true });
  const user = await User.findByIdAndDelete(id).lean();
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

/* ───────────── Roles ───────────── */

export async function listRoles() {
  const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();
  const counts = await User.aggregate<{ _id: unknown; count: number }>([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return roles.map((r) => ({ ...r, userCount: map.get(String(r._id)) ?? 0 }));
}

export async function listPermissions() {
  return Permission.find({}).sort({ module: 1, action: 1 }).lean();
}

export async function createRole(input: { name: string; description?: string; permissions: string[] }) {
  if (input.permissions.includes("*")) throw ApiError.badRequest("The wildcard permission is reserved for the Super Admin role");
  return (await Role.create({ ...input, isSystem: false })).toObject();
}

export async function updateRole(id: string, input: { name?: string; description?: string; permissions?: string[] }) {
  assertObjectId(id);
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound("Role not found");
  if (role.permissions.includes("*")) throw ApiError.badRequest("The Super Admin role cannot be modified");
  if (input.permissions?.includes("*")) throw ApiError.badRequest("The wildcard permission is reserved for the Super Admin role");
  if (role.isSystem && input.name && input.name !== role.name) throw ApiError.badRequest("System role names cannot be changed");
  role.set(input);
  await role.save();
  return role.toObject();
}

export async function deleteRole(id: string) {
  assertObjectId(id);
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound("Role not found");
  if (role.isSystem) throw ApiError.badRequest("System roles cannot be deleted");
  if (await User.exists({ role: id })) throw ApiError.badRequest("Reassign users before deleting this role");
  await role.deleteOne();
  return role.toObject();
}
