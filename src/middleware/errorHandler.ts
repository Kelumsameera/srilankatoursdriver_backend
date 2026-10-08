import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";
import { zodToFieldErrors } from "../utils/zod.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

/** Read at call time so the production behaviour can be verified in tests. */
const inProduction = () => env.NODE_ENV === "production";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl.split("?")[0]}`));
}

interface MongoServerErrorLike {
  code?: number;
  keyValue?: Record<string, unknown>;
}

// Express identifies error handlers by arity, so `_next` must stay.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.badRequest("Validation failed", zodToFieldErrors(err));
  } else if (err instanceof mongoose.Error.ValidationError) {
    apiError = ApiError.badRequest(
      "Validation failed",
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    apiError = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if ((err as MongoServerErrorLike)?.code === 11000) {
    const fields = Object.keys((err as MongoServerErrorLike).keyValue ?? {});
    apiError = ApiError.conflict(
      `A record with this ${fields.join(", ") || "value"} already exists`,
      fields.map((f) => ({ path: f, message: "Must be unique" })),
    );
  } else if (err instanceof multer.MulterError) {
    apiError =
      err.code === "LIMIT_FILE_SIZE" ? ApiError.tooLarge("File is too large") : ApiError.badRequest(`Upload error: ${err.message}`);
  } else if ((err as { type?: string })?.type === "entity.too.large") {
    apiError = ApiError.tooLarge("Request body is too large");
  } else if ((err as { type?: string })?.type === "entity.parse.failed") {
    apiError = ApiError.badRequest("Malformed JSON body");
  } else if ((err as { http_code?: number; message?: string })?.http_code) {
    // Cloudinary SDK errors
    const e = err as { http_code: number; message: string };
    logger.error({ err: e }, "Cloudinary error");
    // Auth/config failures and upstream outages can echo account details – keep those generic in production.
    const detail = inProduction() && (e.http_code === 401 || e.http_code === 403 || e.http_code >= 500) ? "please try again later" : String(e.message).slice(0, 200);
    apiError = new ApiError(e.http_code >= 500 || e.http_code === 401 || e.http_code === 403 ? 502 : 400, `Media service error: ${detail}`, [], "CLOUDINARY_ERROR");
  } else {
    logger.error({ err, path: req.originalUrl }, "Unhandled error");
    apiError = new ApiError(500, inProduction() ? "Something went wrong" : String((err as Error)?.message ?? err), [], "INTERNAL");
  }

  if (apiError.statusCode >= 500 && err instanceof ApiError) logger.error({ err }, apiError.message);

  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    errors: apiError.errors,
    ...(apiError.code ? { code: apiError.code } : {}),
  });
}
