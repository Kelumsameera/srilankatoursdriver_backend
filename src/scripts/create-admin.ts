/**
 * Create or reset an admin account from the command line:
 *   npm run create-admin -- --email you@example.com --name "Your Name" --password "S3curePassw0rd" [--role "Super Admin"]
 * Useful for recovering access if every admin password is lost.
 */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Role, User } from "../models/index.js";
import { hashPassword } from "../services/auth.service.js";
import { passwordPolicy } from "../validations/auth.js";
import { seedPermissionsAndRoles } from "./seed.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const password = arg("password");
  const name = arg("name") ?? "Administrator";
  const roleName = arg("role") ?? "Super Admin";
  if (!email || !password) throw new Error("Usage: --email <email> --password <password> [--name <name>] [--role <role>]");
  const check = passwordPolicy.safeParse(password);
  if (!check.success) throw new Error(check.error.issues.map((i) => i.message).join("; "));

  await connectDatabase();
  await seedPermissionsAndRoles();
  const role = await Role.findOne({ name: roleName });
  if (!role) throw new Error(`Role not found: ${roleName}`);
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ email }).select("+tokenVersion");
  if (existing) {
    existing.set({ passwordHash, role: role._id, status: "active", name, tokenVersion: (existing.tokenVersion ?? 0) + 1, refreshTokens: [] });
    await existing.save();
    console.log(`Updated ${email} (${roleName})`);
  } else {
    await User.create({ email, name, passwordHash, role: role._id, status: "active" });
    console.log(`Created ${email} (${roleName})`);
  }
}

main()
  .then(disconnectDatabase)
  .then(() => process.exit(0))
  .catch(async (err: unknown) => {
    console.error((err as Error).message);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
