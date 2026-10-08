import type { Request, Response } from "express";
import { CrudService, type ResourceConfig } from "../services/crud/crud.service.js";
import { logActivity } from "../services/activity.service.js";
import { revalidateFrontend } from "../services/revalidate.service.js";
import { created, noContent, ok } from "../utils/response.js";
import type { ListQuery } from "../validations/common.js";

type AnyRecord = Record<string, unknown>;

function describe(doc: AnyRecord): string {
  for (const key of ["title", "name", "label", "question", "guestName", "slug", "key"]) {
    if (typeof doc[key] === "string" && doc[key]) return String(doc[key]).slice(0, 120);
  }
  return String(doc._id ?? "");
}

/** Builds controller handlers for a resource: thin HTTP layer over CrudService. */
export function createCrudController(cfg: ResourceConfig) {
  const service = new CrudService(cfg);
  const changed = () => revalidateFrontend(...cfg.cacheTags);

  return {
    service,

    async list(req: Request, res: Response) {
      const { items, meta } = await service.list(req.validated?.query as ListQuery);
      return ok(res, items, "OK", 200, meta);
    },

    async get(req: Request, res: Response) {
      return ok(res, await service.getById(String(req.params.id)));
    },

    async create(req: Request, res: Response) {
      const doc = await service.create(req.validated?.body as AnyRecord, req.user?.id);
      await logActivity(req, { action: "create", entity: cfg.name, entityId: String(doc._id), summary: `Created ${cfg.label}: ${describe(doc)}` });
      changed();
      return created(res, doc, `${cfg.label} item created`);
    },

    async update(req: Request, res: Response) {
      const { before, after } = await service.update(String(req.params.id), req.validated?.body as AnyRecord, req.user?.id);
      const statusChanged = before.status !== after.status && (after.status === "published" || before.status === "published");
      await logActivity(req, {
        action: statusChanged ? (after.status === "published" ? "publish" : "unpublish") : "update",
        entity: cfg.name,
        entityId: String(after._id),
        summary: `Updated ${cfg.label}: ${describe(after)}`,
      });
      changed();
      return ok(res, after, `${cfg.label} item updated`);
    },

    async remove(req: Request, res: Response) {
      const doc = await service.remove(String(req.params.id));
      await logActivity(req, { action: "delete", entity: cfg.name, entityId: String(doc._id), summary: `Deleted ${cfg.label}: ${describe(doc)}` });
      revalidateFrontend(...cfg.cacheTags, ...(cfg.deleteCacheTags ?? []));
      return noContent(res, `${cfg.label} item deleted`);
    },

    async duplicate(req: Request, res: Response) {
      const doc = await service.duplicate(String(req.params.id), req.user?.id);
      await logActivity(req, { action: "create", entity: cfg.name, entityId: String(doc._id), summary: `Duplicated ${cfg.label}: ${describe(doc)}` });
      changed();
      return created(res, doc, `${cfg.label} item duplicated`);
    },

    async reorder(req: Request, res: Response) {
      const { items } = req.validated?.body as { items: { id: string; order: number }[] };
      await service.reorder(items);
      await logActivity(req, { action: "reorder", entity: cfg.name, summary: `Reordered ${items.length} ${cfg.label} items` });
      changed();
      return ok(res, null, "Order saved");
    },

    async setStatus(req: Request, res: Response) {
      const input = req.validated?.body as { status?: string; enabled?: boolean; featured?: boolean };
      const { after } = await service.setStatus(String(req.params.id), input, req.user?.id);
      const action =
        input.status === "published" || input.enabled === true
          ? "publish"
          : input.status !== undefined || input.enabled === false
            ? "unpublish"
            : "update";
      await logActivity(req, { action, entity: cfg.name, entityId: String(after._id), summary: `${action} ${cfg.label}: ${describe(after)}` });
      changed();
      return ok(res, after, "Status updated");
    },
  };
}
