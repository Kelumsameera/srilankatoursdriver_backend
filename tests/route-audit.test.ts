import assert from "node:assert/strict";
import { test } from "node:test";
import { adminRouter } from "../src/routes/admin/index.js";
import { authenticate } from "../src/middleware/authenticate.js";
import { ALL_PERMISSIONS } from "../src/config/permissions.js";
import { RESOURCES } from "../src/config/resources.js";

// Route audit: every route under /api/admin must run `authenticate` and then a `requirePermission` guard.
// It reads Express's internal router stack, so no server or database is needed.

// The parts of Express's internal router layers this test reads
interface Handler {
  (...args: unknown[]): unknown;
  requiredPermissions?: string[];
}
interface Layer {
  handle: Handler & { stack?: Layer[] };
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
  matchers?: ((path: string) => { path: string } | false)[];
}

// One admin route and the permissions its guards require
interface AuditedRoute {
  label: string;
  permissions: string[];
  guardBeforeHandler: boolean;
}

// Mounted sub-routers do not store their path, so try each CRUD resource name, e.g. guestShorts -> /guest-shorts
function mountPathOf(layer: Layer) {
  const candidates = Object.keys(RESOURCES).map((key) => "/" + key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()));
  const match = candidates.find((candidate) => layer.matchers?.[0]?.(candidate + "/x"));
  return match ?? "/<unknown mount>";
}

// Collect every route in a router, including routes inside mounted sub-routers
function collectRoutes(stack: Layer[], prefix = ""): AuditedRoute[] {
  const routes: AuditedRoute[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack.map((routeLayer) => routeLayer.handle);
      const guardIndex = handlers.findIndex((handler) => handler.requiredPermissions);
      const methods = Object.keys(layer.route.methods).map((method) => method.toUpperCase()).join(",");
      routes.push({
        label: `${methods} /api/admin${prefix}${layer.route.path}`,
        permissions: handlers.flatMap((handler) => handler.requiredPermissions ?? []),
        guardBeforeHandler: guardIndex >= 0 && guardIndex < handlers.length - 1,
      });
    } else if (layer.handle.stack) {
      routes.push(...collectRoutes(layer.handle.stack, prefix + mountPathOf(layer)));
    }
  }
  return routes;
}

const adminStack = (adminRouter as unknown as { stack: Layer[] }).stack;
const routes = collectRoutes(adminStack);

test("authenticate runs before every admin route", () => {
  const authenticateIndex = adminStack.findIndex((layer) => layer.handle === (authenticate as unknown));
  const firstRouteIndex = adminStack.findIndex((layer) => layer.route || layer.handle.stack);
  assert.ok(authenticateIndex >= 0, "adminRouter does not use authenticate");
  assert.ok(authenticateIndex < firstRouteIndex, "authenticate is registered after the first admin route");
});

test("every admin route has a requirePermission guard before its handler", (context) => {
  const unguarded = routes.filter((route) => route.permissions.length === 0 || !route.guardBeforeHandler);
  context.diagnostic(`audited ${routes.length} admin routes`);
  for (const route of unguarded) context.diagnostic(`no permission guard: ${route.label}`);
  assert.equal(routes.length > 50, true, "found suspiciously few admin routes – the router structure may have changed");
  assert.deepEqual(unguarded.map((route) => route.label), [], "admin routes without a permission guard");
});

test("every permission used by an admin route exists in the permission catalogue", (context) => {
  const known = new Set<string>([...ALL_PERMISSIONS, "*"]);
  const unknown = routes.flatMap((route) => route.permissions.filter((permission) => !known.has(permission)).map((permission) => `${route.label} -> ${permission}`));
  for (const entry of unknown) context.diagnostic(`unknown permission: ${entry}`);
  assert.deepEqual(unknown, [], "admin routes that require a permission no role can be given");
});

test("every CRUD sub-router was found at its mount path", () => {
  const unknownMounts = routes.filter((route) => route.label.includes("<unknown mount>")).map((route) => route.label);
  assert.deepEqual(unknownMounts, [], "a mounted admin router's path could not be identified");
});
