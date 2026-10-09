import type { Request, Response } from "express";
import * as guests from "../services/guests.service.js";
import { logActivity } from "../services/activity.service.js";
import { ok } from "../utils/response.js";
import type { ListQuery } from "../validations/common.js";

const emailParam = (req: Request) => (req.validated?.params as { email: string }).email;

export async function list(req: Request, res: Response) {
  const { items, meta, stats } = await guests.listGuests(req.validated?.query as ListQuery);
  return res.json({ success: true, message: "OK", data: items, meta, stats });
}

export async function get(req: Request, res: Response) {
  return ok(res, await guests.getGuest(emailParam(req)));
}

export async function update(req: Request, res: Response) {
  const email = emailParam(req);
  const body = req.validated?.body as guests.GuestUpdate;
  const records = await guests.updateGuest(email, body);
  await logActivity(req, { action: "update", entity: "guest", summary: `Guest <${email}>: updated ${Object.keys(body).join(", ")} on ${records} record(s)` });
  return ok(res, await guests.getGuest(email), "Saved");
}

export async function erase(req: Request, res: Response) {
  const email = emailParam(req);
  const records = await guests.eraseGuest(email);
  // The address itself is personal data, so the log only says that an erasure happened.
  await logActivity(req, { action: "delete", entity: "guest", summary: `Erased a guest's personal data from ${records} record(s)` });
  return ok(res, { records }, "Personal data erased");
}

export async function exportCsv(req: Request, res: Response) {
  const csv = await guests.exportGuests(req.validated?.query as ListQuery);
  await logActivity(req, { action: "export", entity: "guest", summary: "Exported guests to CSV" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="guests-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(String.fromCharCode(0xfeff) + csv);
}
