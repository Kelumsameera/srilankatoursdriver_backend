import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { allowedOrigins, env } from "./config/env.js";
import { logger, redactRequestForLog } from "./config/logger.js";
import { apiLimiter, originCheck, sanitizeBody, warnOnUntrustedProxy } from "./middleware/security.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);
  app.set("query parser", "simple"); // no nested objects from query strings

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxAge: 600,
    }),
  );
  app.use(warnOnUntrustedProxy);
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      // Receives pino's standard request object (url, query, headers …).
      serializers: { req: redactRequestForLog },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());
  app.use(sanitizeBody);
  app.use("/api", apiLimiter, originCheck, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
