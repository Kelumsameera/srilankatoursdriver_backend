import type { Request, Response } from "express";
import * as crm from "../services/crm.service.js";
import { logActivity } from "../services/activity.service.js";
import { created, noContent, ok } from "../utils/response.js";
import type { ListQuery } from "../validations/common.js";

/* ───────────── Public submissions ───────────── */

export async function submitBooking(req: Request, res: Response) {
  return created(res, await crm.createBooking(req.validated?.body as Record<string, unknown>), "Thank you! Your booking request has been received.");
}

export async function submitTailorMade(req: Request, res: Response) {
  return created(
    res,
    await crm.createTailorMadeEnquiry(req.validated?.body as Record<string, unknown>),
    "Thank you! Your tailor-made tour enquiry has been received.",
  );
}

export async function submitContact(req: Request, res: Response) {
  return created(res, await crm.createContactMessage(req.validated?.body as Record<string, unknown>), "Thank you! We will get back to you shortly.");
}

/* ───────────── Admin (bookings / enquiries / contacts) ───────────── */

export function crmController(kind: crm.CrmKind) {
  const entity = kind === "bookings" ? "booking" : kind === "enquiries" ? "tailorMadeEnquiry" : "contactMessage";
  const ref = (doc: Record<string, unknown>) => String(doc.reference ?? doc.email ?? doc._id);
  return {
    async list(req: Request, res: Response) {
      const { items, meta, statusCounts } = await crm.listCrm(kind, req.validated?.query as ListQuery);
      return res.json({ success: true, message: "OK", data: items, meta, statusCounts });
    },
    async get(req: Request, res: Response) {
      return ok(res, await crm.getCrm(kind, String(req.params.id)));
    },
    async update(req: Request, res: Response) {
      const { before, after } = await crm.updateCrm(kind, String(req.params.id), req.validated?.body as Record<string, unknown>, req.user?.id);
      await logActivity(req, {
        action: "update",
        entity,
        entityId: String(after._id),
        summary: before !== after.status ? `${ref(after)}: status ${before} → ${String(after.status)}` : `Updated ${ref(after)}`,
      });
      return ok(res, after, "Saved");
    },
    async addNote(req: Request, res: Response) {
      const { text } = req.validated?.body as { text: string };
      const doc = await crm.addCrmNote(kind, String(req.params.id), text, { id: req.user!.id, name: req.user!.name });
      await logActivity(req, { action: "update", entity, entityId: String(req.params.id), summary: `Added note to ${ref(doc as Record<string, unknown>)}` });
      return created(res, doc, "Note added");
    },
    async deleteNote(req: Request, res: Response) {
      const doc = await crm.deleteCrmNote(kind, String(req.params.id), String(req.params.noteId));
      await logActivity(req, { action: "update", entity, entityId: String(req.params.id), summary: `Removed a note from ${ref(doc as Record<string, unknown>)}` });
      return ok(res, doc, "Note removed");
    },
    async remove(req: Request, res: Response) {
      const doc = await crm.deleteCrm(kind, String(req.params.id));
      await logActivity(req, { action: "delete", entity, entityId: String(doc._id), summary: `Deleted ${ref(doc)}` });
      return noContent(res);
    },
    async exportCsv(req: Request, res: Response) {
      const csv = await crm.exportCrm(kind, req.validated?.query as ListQuery);
      await logActivity(req, { action: "export", entity, summary: `Exported ${kind} to CSV` });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(String.fromCharCode(0xfeff) + csv);
    },
  };
}
