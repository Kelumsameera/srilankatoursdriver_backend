import { Types } from "mongoose";
import { Booking, Customer } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId, escapeRegex, toCsv } from "../utils/helpers.js";
import type { ListQuery } from "../validations/common.js";

type AnyRecord = Record<string, unknown>;

const SORTS: Record<string, Record<string, 1 | -1>> = {
  "-createdAt": { createdAt: -1 },
  createdAt: { createdAt: 1 },
  "-lastLoginAt": { lastLoginAt: -1 },
  name: { name: 1 },
};

function filterFor(q: Pick<ListQuery, "search" | "status" | "type">) {
  const filter: AnyRecord = {};
  if (q.status === "active" || q.status === "suspended") filter.status = q.status;
  if (q.status === "unverified") filter.emailVerified = { $ne: true };
  if (q.type === "google") filter.googleId = { $exists: true, $ne: null };
  if (q.type === "password") filter.passwordHash = { $exists: true, $ne: null };
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  return filter;
}

/** Admin view of an account – never exposes hashes or tokens, only what they imply. */
function present(c: AnyRecord, bookingCount = 0) {
  return {
    _id: String(c._id),
    name: c.name,
    email: c.email,
    avatar: c.avatar || null,
    status: c.status,
    emailVerified: !!c.emailVerified,
    google: !!c.googleId,
    hasPassword: !!c.passwordHash,
    lastLoginAt: c.lastLoginAt ?? null,
    createdAt: c.createdAt,
    bookingCount,
  };
}

/** Bookings per account – linked by account, or (for verified addresses) by the email on the booking. */
async function bookingCounts(customers: AnyRecord[]) {
  if (!customers.length) return new Map<string, number>();
  const ids = customers.map((c) => c._id as Types.ObjectId);
  const verifiedEmails = customers.filter((c) => c.emailVerified).map((c) => String(c.email));
  const rows = await Booking.find({ $or: [{ account: { $in: ids } }, { "customer.email": { $in: verifiedEmails } }] })
    .select("account customer.email")
    .lean();
  const byEmail = new Map(customers.filter((c) => c.emailVerified).map((c) => [String(c.email), String(c._id)]));
  const counts = new Map<string, number>();
  for (const b of rows) {
    const owner = b.account ? String(b.account) : byEmail.get(String(b.customer?.email));
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

export async function listCustomers(q: ListQuery) {
  const filter = filterFor(q);
  const monthStart = new Date(Date.now() - 30 * 86_400_000);
  const [docs, total, all, active, suspended, verified, recent] = await Promise.all([
    Customer.find(filter)
      .select("+passwordHash +googleId")
      .sort(SORTS[q.sort ?? ""] ?? { createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Customer.countDocuments(filter),
    Customer.countDocuments(),
    Customer.countDocuments({ status: "active" }),
    Customer.countDocuments({ status: "suspended" }),
    Customer.countDocuments({ emailVerified: true }),
    Customer.countDocuments({ createdAt: { $gte: monthStart } }),
  ]);
  const counts = await bookingCounts(docs as AnyRecord[]);
  return {
    items: docs.map((d) => present(d as AnyRecord, counts.get(String(d._id)) ?? 0)),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
    stats: { total: all, active, suspended, verified, last30Days: recent },
  };
}

export async function getCustomer(id: string) {
  assertObjectId(id);
  const c = await Customer.findById(id).select("+passwordHash +googleId").lean();
  if (!c) throw ApiError.notFound("Customer not found");
  const match = c.emailVerified ? { $or: [{ account: c._id }, { "customer.email": c.email }] } : { account: c._id };
  const bookings = await Booking.find(match)
    .sort({ createdAt: -1 })
    .limit(50)
    .select("reference type itemTitle status startDate adults children quotedAmount currency createdAt account")
    .lean();
  return {
    ...present(c as AnyRecord, bookings.length),
    bookings: bookings.map((b) => ({ ...b, linked: !!b.account })),
  };
}

export async function updateCustomer(id: string, input: { name?: string; status?: "active" | "suspended"; emailVerified?: boolean }) {
  assertObjectId(id);
  const c = await Customer.findById(id).select("+tokenVersion");
  if (!c) throw ApiError.notFound("Customer not found");
  const before = c.status;
  if (input.name !== undefined) c.name = input.name;
  if (input.emailVerified !== undefined) c.emailVerified = input.emailVerified;
  if (input.status !== undefined && input.status !== c.status) {
    c.status = input.status;
    // Suspending ends every session right away (access tokens carry the version).
    if (input.status === "suspended") revoke(c);
  }
  await c.save();
  return { before, customer: await getCustomer(id) };
}

function revoke(c: { tokenVersion?: number | null; set: (path: string, v: unknown) => unknown }) {
  c.tokenVersion = (c.tokenVersion ?? 0) + 1;
  c.set("refreshTokens", []);
  c.set("rotatedTokens", []);
}

export async function revokeCustomerSessions(id: string) {
  assertObjectId(id);
  const c = await Customer.findById(id).select("+tokenVersion");
  if (!c) throw ApiError.notFound("Customer not found");
  revoke(c);
  await c.save();
  return c;
}

/** Deletes the account. Its bookings stay in the CRM (they belong to the business) but are unlinked. */
export async function deleteCustomer(id: string) {
  assertObjectId(id);
  const c = await Customer.findByIdAndDelete(id).lean();
  if (!c) throw ApiError.notFound("Customer not found");
  await Booking.updateMany({ account: c._id }, { $unset: { account: 1 } });
  return c;
}

export async function exportCustomers(q: ListQuery) {
  const docs = await Customer.find(filterFor(q)).select("+passwordHash +googleId").sort({ createdAt: -1 }).limit(10_000).lean();
  const counts = await bookingCounts(docs as AnyRecord[]);
  const rows = docs.map((d) => {
    const p = present(d as AnyRecord, counts.get(String(d._id)) ?? 0);
    return { ...p, signIn: [p.google && "Google", p.hasPassword && "Password"].filter(Boolean).join(" + ") };
  });
  return toCsv(rows, [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "status", label: "Status" },
    { key: "emailVerified", label: "Email verified" },
    { key: "signIn", label: "Sign-in" },
    { key: "bookingCount", label: "Bookings" },
    { key: "lastLoginAt", label: "Last sign-in" },
    { key: "createdAt", label: "Joined" },
  ]);
}
