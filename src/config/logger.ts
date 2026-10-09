import { pino } from "pino";
import { env, isProduction, isTest } from "./env.js";

/** Preview links carry a token in the query string; keep it out of request logs. */
export function redactRequestForLog<T extends { url?: string; query?: Record<string, unknown> }>(req: T): T {
  const url = req.url?.replace(/([?&]token=)[^&#]*/gi, "$1[redacted]");
  const query = req.query && "token" in req.query ? { ...req.query, token: "[redacted]" } : req.query;
  return { ...req, url, query };
}

export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-sltd-proxy-secret']",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  ...(isProduction || isTest
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }),
});
