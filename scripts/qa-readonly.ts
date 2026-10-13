/** Local QA launcher. Uses the real app/configuration while prohibiting MongoDB writes.
 * Run from backend/: node --import tsx scripts/qa-readonly.ts
 * Never use this read-only launcher for a production deployment. */
import mongoose from "mongoose";
import express from "express";

process.env.LOG_LEVEL = "silent"; // startup errors must not print credential-bearing connection details
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);
for (const method of ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete", "deleteOne", "deleteMany", "bulkWrite", "createIndex", "createIndexes", "dropIndex", "dropIndexes", "drop"]) {
  Object.defineProperty(mongoose.Collection.prototype, method, { configurable: true, value: () => { throw new Error("QA read-only guard: database mutation disabled"); } });
}

async function main() {
  const { env } = await import("../src/config/env.js");
  const { connectDatabase, disconnectDatabase } = await import("../src/config/db.js");
  const { createApp } = await import("../src/app.js");
  await connectDatabase();
  const app = express();
  app.use((req, res, next) => ["GET", "HEAD", "OPTIONS"].includes(req.method) ? next() : res.status(403).json({ success: false, message: "QA read-only guard: mutation disabled" }));
  app.use(createApp());
  const server = app.listen(env.PORT, "127.0.0.1", () => console.log("REAL_API_READ_ONLY_READY: MongoDB connected; automatic initialization and database/HTTP mutations blocked"));
  const close = () => server.close(async () => { await disconnectDatabase(); process.exit(0); });
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((error: unknown) => {
  console.error(`REAL_API_START_FAILED: ${error instanceof Error ? error.name : "unknown"}; credential-bearing details suppressed`);
  process.exit(1);
});
