import type { ZodError } from "zod";
import type { FieldError } from "./ApiError.js";

export function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
