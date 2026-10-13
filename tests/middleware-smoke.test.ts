import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { requirePermission } from "../src/middleware/authenticate.js";
import { validate } from "../src/middleware/validate.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { ApiError } from "../src/utils/ApiError.js";

// Smoke tests for shared middleware. They use plain fake req/res objects, so no database is needed.

// Runs one middleware and returns whatever it passed to next()
function runMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>) {
  let nextValue: unknown = "next was not called";
  middleware(req as Request, {} as Response, (value?: unknown) => {
    nextValue = value;
  });
  return nextValue;
}

// Fake admin user with the given permissions
function adminWith(permissions: string[]) {
  return { id: "1", name: "Test", email: "test@example.com", roleId: "r1", roleName: "Test", permissions } as Request["user"];
}

// Fake Express response that records status and JSON body
function fakeResponse() {
  const recorded = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      recorded.status = code;
      return response;
    },
    json(body: unknown) {
      recorded.body = body;
      return response;
    },
  };
  return { response: response as unknown as Response, recorded };
}

test("requirePermission allows exact, module wildcard and full wildcard permissions", () => {
  const guard = requirePermission("tours:update");
  assert.equal(runMiddleware(guard, { user: adminWith(["tours:update"]) }), undefined);
  assert.equal(runMiddleware(guard, { user: adminWith(["tours:*"]) }), undefined);
  assert.equal(runMiddleware(guard, { user: adminWith(["*"]) }), undefined);
});

test("requirePermission denies missing permission (403) and missing user (401)", () => {
  const guard = requirePermission("tours:update", "tours:delete");

  const forbidden = runMiddleware(guard, { user: adminWith(["tours:update", "blog:*"]) });
  assert.ok(forbidden instanceof ApiError);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.message, "Missing permission: tours:delete");

  const unauthorized = runMiddleware(guard, {});
  assert.ok(unauthorized instanceof ApiError);
  assert.equal(unauthorized.statusCode, 401);
});

test("validate() rejects bad input with field errors and stores parsed input", () => {
  const middleware = validate({ query: z.object({ page: z.coerce.number().int().min(1) }) });

  const rejected = runMiddleware(middleware, { query: { page: "0" } } as Partial<Request>);
  assert.ok(rejected instanceof ApiError);
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.message, "Validation failed");
  assert.equal(rejected.errors[0]?.path, "page");

  const request = { query: { page: "2", extra: "x" } } as Partial<Request>;
  assert.equal(runMiddleware(middleware, request), undefined);
  assert.deepEqual(request.validated?.query, { page: 2 });
});

test("errorHandler sends the standard error format", () => {
  const request = { originalUrl: "/api/test" } as Request;

  const notFound = fakeResponse();
  errorHandler(ApiError.notFound("Tour not found"), request, notFound.response, () => {});
  assert.equal(notFound.recorded.status, 404);
  assert.deepEqual(notFound.recorded.body, { success: false, message: "Tour not found", errors: [], code: "NOT_FOUND" });

  const badJson = fakeResponse();
  errorHandler({ type: "entity.parse.failed" }, request, badJson.response, () => {});
  assert.equal(badJson.recorded.status, 400);
  assert.deepEqual(badJson.recorded.body, { success: false, message: "Malformed JSON body", errors: [], code: "BAD_REQUEST" });
});
