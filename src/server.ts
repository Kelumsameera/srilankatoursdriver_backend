import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { createApp } from "./app.js";

async function main() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}/api`));

  const shutdown = (signal: string) => {
    logger.info(`${signal} received – shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled promise rejection"));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
