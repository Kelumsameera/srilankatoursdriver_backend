export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors: FieldError[];
  readonly code?: string;

  constructor(statusCode: number, message: string, errors: FieldError[] = [], code?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
  }

  static badRequest(message = "Bad request", errors: FieldError[] = []) {
    return new ApiError(400, message, errors, "BAD_REQUEST");
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, [], "UNAUTHORIZED");
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message, [], "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, [], "NOT_FOUND");
  }
  static conflict(message = "Resource already exists", errors: FieldError[] = []) {
    return new ApiError(409, message, errors, "CONFLICT");
  }
  static tooLarge(message = "Payload too large") {
    return new ApiError(413, message, [], "PAYLOAD_TOO_LARGE");
  }
  static unavailable(message = "Service unavailable") {
    return new ApiError(503, message, [], "SERVICE_UNAVAILABLE");
  }
}
