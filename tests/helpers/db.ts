import crypto from "node:crypto";
import mongoose from "mongoose";
import type { MongoMemoryServer } from "mongodb-memory-server";

let memory: MongoMemoryServer | null = null;

/**
 * Connects mongoose to a throw-away database.
 * - Default: an in-memory MongoDB (mongodb-memory-server downloads a mongod binary on first run).
 * - Set MONGODB_TEST_URI to use an existing server instead (a unique database is created and dropped).
 */
export async function startTestDb(): Promise<void> {
  const external = process.env.MONGODB_TEST_URI;
  const dbName = `sltd_test_${crypto.randomBytes(4).toString("hex")}`;
  if (external) {
    await mongoose.connect(external, { dbName });
  } else {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memory = await MongoMemoryServer.create();
    await mongoose.connect(memory.getUri(), { dbName });
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => undefined)));
}

export async function stopTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  if (memory) await memory.stop();
  memory = null;
}
