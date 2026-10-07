import type { Response } from "express";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, message = "OK", status = 200, meta?: PaginationMeta) {
  return res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T, message = "Created") {
  return ok(res, data, message, 201);
}

export function noContent(res: Response, message = "Deleted") {
  return res.status(200).json({ success: true, message, data: null });
}
