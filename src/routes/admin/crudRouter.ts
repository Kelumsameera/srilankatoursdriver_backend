import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { listQuery, objectId, reorderSchema, statusSchema } from "../../validations/common.js";
import { createCrudController } from "../../controllers/crud.controller.js";
import type { ResourceConfig } from "../../services/crud/crud.service.js";

const idParams = z.object({ id: objectId });

/**
 * Standard admin REST routes for a resource. `authenticate` is applied by the parent admin router;
 * every route below additionally enforces a module permission.
 *
 *   GET    /            list (search, filter, sort, paginate)
 *   GET    /:id         read
 *   POST   /            create
 *   PUT    /:id         update (PATCH is an alias)
 *   DELETE /:id         delete
 *   POST   /:id/duplicate
 *   PATCH  /reorder     bulk order
 *   PATCH  /:id/status  publish / unpublish / enable / disable / feature
 */
export function crudRouter(cfg: ResourceConfig, extend?: (router: Router) => void) {
  const router = Router();
  const c = createCrudController(cfg);
  const p = cfg.permission;

  // Custom routes go first so they win over "/:id".
  extend?.(router);

  router.get("/", requirePermission(`${p}:read`), validate({ query: listQuery }), c.list);
  router.patch("/reorder", requirePermission(`${p}:update`), validate({ body: reorderSchema }), c.reorder);
  router.post("/", requirePermission(`${p}:create`), validate({ body: cfg.createSchema }), c.create);
  router.get("/:id", requirePermission(`${p}:read`), validate({ params: idParams }), c.get);
  router.put("/:id", requirePermission(`${p}:update`), validate({ params: idParams, body: cfg.updateSchema }), c.update);
  router.patch("/:id", requirePermission(`${p}:update`), validate({ params: idParams, body: cfg.updateSchema }), c.update);
  router.delete("/:id", requirePermission(`${p}:delete`), validate({ params: idParams }), c.remove);
  router.post("/:id/duplicate", requirePermission(`${p}:create`), validate({ params: idParams }), c.duplicate);
  router.patch("/:id/status", requirePermission(`${p}:update`), validate({ params: idParams, body: statusSchema }), c.setStatus);

  return router;
}
