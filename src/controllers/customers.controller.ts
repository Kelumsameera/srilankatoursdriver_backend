import type { Request, Response } from "express";
import * as customers from "../services/customers.service.js";
import { logActivity } from "../services/activity.service.js";
import { noContent, ok } from "../utils/response.js";
import type { ListQuery } from "../validations/common.js";

const label = (c: { name?: unknown; email?: unknown }) => `${String(c.name)} <${String(c.email)}>`;

export async function list(req: Request, res: Response) {
  const { items, meta, stats } = await customers.listCustomers(req.validated?.query as ListQuery);
  return res.json({ success: true, message: "OK", data: items, meta, stats });
}

export async function get(req: Request, res: Response) {
  return ok(res, await customers.getCustomer(String(req.params.id)));
}

export async function update(req: Request, res: Response) {
  const body = req.validated?.body as Parameters<typeof customers.updateCustomer>[1];
  const { before, customer } = await customers.updateCustomer(String(req.params.id), body);
  const changes = [
    body.status && before !== body.status ? `status ${before} → ${body.status}` : "",
    body.name ? "name" : "",
    body.emailVerified !== undefined ? `email ${body.emailVerified ? "verified" : "unverified"}` : "",
  ].filter(Boolean);
  await logActivity(req, { action: "update", entity: "customer", entityId: customer._id, summary: `Customer ${label(customer)}: ${changes.join(", ")}` });
  return ok(res, customer, "Saved");
}

export async function revokeSessions(req: Request, res: Response) {
  const c = await customers.revokeCustomerSessions(String(req.params.id));
  await logActivity(req, { action: "update", entity: "customer", entityId: String(c._id), summary: `Signed out ${label(c)} everywhere` });
  return ok(res, null, "All sessions ended");
}

export async function remove(req: Request, res: Response) {
  const c = await customers.deleteCustomer(String(req.params.id));
  await logActivity(req, { action: "delete", entity: "customer", entityId: String(c._id), summary: `Deleted customer ${label(c)}` });
  return noContent(res);
}

export async function exportCsv(req: Request, res: Response) {
  const csv = await customers.exportCustomers(req.validated?.query as ListQuery);
  await logActivity(req, { action: "export", entity: "customer", summary: "Exported customers to CSV" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(String.fromCharCode(0xfeff) + csv);
}
