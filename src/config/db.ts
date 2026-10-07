import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

mongoose.set("strictQuery", true);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });
  logger.info({ db: conn.connection.name }, "MongoDB connected");
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** True when the connected deployment supports multi-document transactions (replica set / sharded). */
export async function supportsTransactions(): Promise<boolean> {
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) return false;
    const hello = (await admin.command({ hello: 1 })) as { setName?: string; msg?: string };
    return Boolean(hello.setName) || hello.msg === "isdbgrid";
  } catch {
    return false;
  }
}

/**
 * Runs `fn` in a transaction when the deployment supports it, otherwise runs it directly.
 * Standalone MongoDB (common in local development) does not support transactions.
 */
export async function withOptionalTransaction<T>(fn: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
