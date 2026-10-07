import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { seedAll } from "../../src/scripts/seed.js";
import { Role, User } from "../../src/models/index.js";
import { hashPassword } from "../../src/services/auth.service.js";

export const ADMIN = { email: "admin@test.local", password: "AdminPassw0rd!" };

let app: Express | null = null;
export function getApp(): Express {
  app ??= createApp();
  return app;
}

export async function seed() {
  const log = console.log;
  console.log = () => undefined; // keep test output clean
  try {
    await seedAll();
  } finally {
    console.log = log;
  }
}

/** Returns a supertest agent that keeps auth cookies between requests. */
export async function loginAs(email = ADMIN.email, password = ADMIN.password) {
  const agent = request.agent(getApp());
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function createUserWithRole(roleName: string, email: string, password = "Passw0rdPassw0rd") {
  const role = await Role.findOne({ name: roleName });
  if (!role) throw new Error(`Role ${roleName} not found`);
  await User.create({ name: roleName, email, role: role._id, passwordHash: await hashPassword(password), status: "active" });
  return { email, password };
}

export function futureDate(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
