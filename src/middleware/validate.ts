import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { zodToFieldErrors } from "../utils/zod.js";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates request parts with Zod. Parsed values (with unknown keys stripped) are
 * stored on `req.validated` – controllers must read from there, never raw input.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validated = req.validated ?? {};
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        return next(ApiError.badRequest("Validation failed", zodToFieldErrors(result.error)));
      }
      req.validated[part] = result.data;
    }
    next();
  };
}

export function body<T>(req: Request): T {
  return req.validated?.body as T;
}
export function query<T>(req: Request): T {
  return req.validated?.query as T;
}
