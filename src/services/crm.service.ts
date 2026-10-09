import type { Model, SortOrder } from "mongoose";
import { Booking, ContactMessage, Destination, Excursion, Review, TailorMadeEnquiry, Tour, User, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId, escapeRegex, fingerprint, generateReference, sha256, toCsv } from "../utils/helpers.js";
import type { ListQuery } from "../validations/common.js";
import { env } from "../config/env.js";
import { notifyNewSubmission } from "./email/email.service.js";

type AnyRecord = Record<string, unknown>;

/* ───────────────────────── Public submissions ───────────────────────── */

/** Identical submissions inside this window return the first result instead of creating duplicates. */
export const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * HMAC key for submission fingerprints. Derived from JWT_REFRESH_SECRET rather than reusing that
 * secret directly, so one key is never used for two different purposes.
 */
const FINGERPRINT_KEY = sha256(`submission-fingerprint:${env.JWT_REFRESH_SECRET}`);

/** True when the hidden honeypot field was filled in – only bots do that. */
export function isBotSubmission(input: AnyRecord): boolean {
  return typeof input.website === "string" && input.website.trim().length > 0;
}

function withoutMeta(input: AnyRecord): AnyRecord {
  const { website: _hp, locale: _l, ...rest } = input;
  void _hp;
  void _l;
  return rest;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findRecentDuplicate(model: Model<any>, submissionHash: string) {
  return model
    .findOne({ submissionHash, createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } })
    .select("_id reference")
    .lean<{ _id: unknown; reference?: string }>();
}

/** `accountId`: the signed-in website customer, so the request shows up under their "My bookings". */
export async function createBooking(input: AnyRecord, accountId?: string) {
  if (isBotSubmission(input)) return { reference: generateReference("B"), id: "" };
  const data = { ...input };
  delete data.website;
  const submissionHash = fingerprint(withoutMeta(data), FINGERPRINT_KEY);
  const duplicate = await findRecentDuplicate(Booking, submissionHash);
  if (duplicate) return { reference: String(duplicate.reference), id: String(duplicate._id), duplicate: true };

  let itemTitle = "";
  const type = String(data.type ?? "general");
  const refModel: Record<string, Model<AnyRecord>> = {
    tour: Tour as unknown as Model<AnyRecord>,
    excursion: Excursion as unknown as Model<AnyRecord>,
    vehicle: Vehicle as unknown as Model<AnyRecord>,
  };
  if (type in refModel) {
    const id = data[type];
    if (!id) throw ApiError.badRequest(`Please choose a ${type}`, [{ path: type, message: "Required" }]);
    const item = await refModel[type].findOne({ _id: id, status: "published" }).select("title name").lean();
    if (!item) throw ApiError.badRequest(`Selected ${type} is not available`);
    itemTitle = String(item.title ?? item.name ?? "");
  }
  for (const k of ["tour", "excursion", "vehicle"]) if (k !== type) delete data[k];

  const booking = await Booking.create({
    ...data,
    itemTitle,
    account: accountId,
    submissionHash,
    reference: generateReference("B"),
    statusHistory: [{ status: "new", changedAt: new Date() }],
  });
  const customer = booking.customer!;
  void notifyNewSubmission(
    "booking request",
    booking.reference,
    customer.email,
    customer.name,
    [
      ["Name", customer.name],
      ["Email", customer.email],
      ["Phone", customer.phone],
      ["WhatsApp", customer.whatsapp],
      ["Country", customer.country],
      ["Booking for", itemTitle || type],
      ["Start date", booking.startDate],
      ["End date", booking.endDate],
      ["Adults", booking.adults],
      ["Children", booking.children],
      ["Pickup", booking.pickupLocation],
      ["Message", booking.message],
    ],
  );
  return { reference: booking.reference, id: String(booking._id) };
}

export async function createTailorMadeEnquiry(input: AnyRecord) {
  if (isBotSubmission(input)) return { reference: generateReference("T"), id: "" };
  const data = { ...input };
  delete data.website;
  const submissionHash = fingerprint(withoutMeta(data), FINGERPRINT_KEY);
  const duplicate = await findRecentDuplicate(TailorMadeEnquiry, submissionHash);
  if (duplicate) return { reference: String(duplicate.reference), id: String(duplicate._id), duplicate: true };

  // Only keep references to content that exists and is public.
  if (Array.isArray(data.destinations) && data.destinations.length) {
    const found = await Destination.find({ _id: { $in: data.destinations }, status: "published" }).select("_id").lean();
    const ok = new Set(found.map((d) => String(d._id)));
    data.destinations = (data.destinations as string[]).filter((d) => ok.has(String(d)));
  }
  const vehicle = data.vehicle as { vehicleRef?: string | null } | undefined;
  if (vehicle?.vehicleRef && !(await Vehicle.exists({ _id: vehicle.vehicleRef, status: "published" }))) {
    data.vehicle = { ...vehicle, vehicleRef: null };
  }

  const travel = data.travel as { arrivalDate: Date; departureDate: Date };
  const durationDays = Math.max(1, Math.round((travel.departureDate.getTime() - travel.arrivalDate.getTime()) / 86_400_000));
  const enquiry = await TailorMadeEnquiry.create({
    ...data,
    submissionHash,
    travel: { ...(data.travel as AnyRecord), durationDays },
    reference: generateReference("T"),
    statusHistory: [{ status: "new", changedAt: new Date() }],
  });
  const p = enquiry.personal!;
  void notifyNewSubmission(
    "tailor-made tour enquiry",
    enquiry.reference,
    p.email,
    p.firstName,
    [
      ["Name", `${p.firstName} ${p.lastName ?? ""}`.trim()],
      ["Email", p.email],
      ["Phone", p.phone],
      ["WhatsApp", p.whatsapp],
      ["Country", p.country],
      ["Arrival", enquiry.travel?.arrivalDate],
      ["Departure", enquiry.travel?.departureDate],
      ["Days", durationDays],
      ["Adults", enquiry.travelers?.adults],
      ["Children", enquiry.travelers?.children],
      ["Interests", enquiry.interests],
      ["Hotel category", enquiry.hotels?.category],
      ["Budget", enquiry.budget?.amount ? `${enquiry.budget.amount} ${enquiry.budget.currency}` : enquiry.budget?.range],
      ["Requirements", enquiry.additionalRequirements],
    ],
  );
  return { reference: enquiry.reference, id: String(enquiry._id) };
}

export async function createContactMessage(input: AnyRecord) {
  if (isBotSubmission(input)) return { id: "" };
  const data = { ...input };
  delete data.website;
  const submissionHash = fingerprint(withoutMeta(data), FINGERPRINT_KEY);
  const duplicate = await findRecentDuplicate(ContactMessage, submissionHash);
  if (duplicate) return { id: String(duplicate._id), duplicate: true };

  const msg = await ContactMessage.create({ ...data, submissionHash });
  void notifyNewSubmission(
    "message",
    `SLTD-C-${String(msg._id).slice(-6).toUpperCase()}`,
    msg.email,
    msg.name,
    [
      ["Name", msg.name],
      ["Email", msg.email],
      ["Phone", msg.phone],
      ["Subject", msg.subject],
      ["Message", msg.message],
    ],
  );
  return { id: String(msg._id) };
}

/** Public review submission – always pending & unverified; bots and duplicates are dropped quietly. */
export async function createPublicReview(input: AnyRecord) {
  if (isBotSubmission(input)) return { id: "" };
  const data = withoutMeta(input);
  const submissionHash = fingerprint(data, FINGERPRINT_KEY);
  const duplicate = await findRecentDuplicate(Review, submissionHash);
  if (duplicate) return { id: String(duplicate._id), duplicate: true };
  if (data.tour && !(await Tour.exists({ _id: data.tour, status: "published" }))) data.tour = null;
  const review = await Review.create({ ...data, submissionHash, platform: "website", status: "pending", verified: false, date: new Date() });
  return { id: String(review._id) };
}

/* ───────────────────────── Admin CRM ───────────────────────── */

interface CrmConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  label: string;
  searchFields: string[];
  populate: { path: string; select: string }[];
}

export const CRM = {
  bookings: {
    model: Booking,
    label: "Booking",
    searchFields: ["reference", "customer.name", "customer.email", "customer.phone", "itemTitle"],
    populate: [
      { path: "assignedTo", select: "name email" },
      { path: "tour", select: "title slug" },
      { path: "excursion", select: "title slug" },
      { path: "vehicle", select: "name slug" },
    ],
  },
  enquiries: {
    model: TailorMadeEnquiry,
    label: "Enquiry",
    searchFields: ["reference", "personal.firstName", "personal.lastName", "personal.email", "personal.phone"],
    populate: [
      { path: "assignedTo", select: "name email" },
      { path: "destinations", select: "name slug" },
      { path: "vehicle.vehicleRef", select: "name" },
    ],
  },
  contacts: {
    model: ContactMessage,
    label: "Message",
    searchFields: ["name", "email", "subject", "message"],
    populate: [],
  },
} satisfies Record<string, CrmConfig>;

export type CrmKind = keyof typeof CRM;

function crmFilter(cfg: CrmConfig, q: Partial<ListQuery>) {
  const filter: AnyRecord = {};
  if (q.status) filter.status = q.status;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = cfg.searchFields.map((f) => ({ [f]: rx }));
  }
  return filter;
}

function crmSort(q: Partial<ListQuery>): Record<string, SortOrder> {
  const allowed = ["createdAt", "updatedAt", "status", "startDate", "reference"];
  if (!q.sort) return { createdAt: -1 };
  const desc = q.sort.startsWith("-");
  const field = desc ? q.sort.slice(1) : q.sort;
  return allowed.includes(field) ? { [field]: desc ? -1 : 1 } : { createdAt: -1 };
}

export async function listCrm(kind: CrmKind, q: ListQuery) {
  const cfg = CRM[kind] as CrmConfig;
  const filter = crmFilter(cfg, q);
  let query = cfg.model.find(filter).sort(crmSort(q)).skip((q.page - 1) * q.limit).limit(q.limit);
  for (const p of cfg.populate) query = query.populate(p);
  const [items, total, counts] = await Promise.all([
    query.lean(),
    cfg.model.countDocuments(filter),
    cfg.model.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  return {
    items,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
    statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  };
}

export async function getCrm(kind: CrmKind, id: string) {
  assertObjectId(id);
  const cfg = CRM[kind] as CrmConfig;
  let query = cfg.model.findById(id);
  for (const p of cfg.populate) query = query.populate(p);
  query = query.populate({ path: "notes.author", select: "name" });
  const doc = await query.lean();
  if (!doc) throw ApiError.notFound(`${cfg.label} not found`);
  if (kind === "contacts" && (doc as AnyRecord).status === "new") await ContactMessage.updateOne({ _id: id }, { status: "read" });
  return doc;
}

export async function updateCrm(kind: CrmKind, id: string, patch: AnyRecord, userId?: string) {
  assertObjectId(id);
  const cfg = CRM[kind] as CrmConfig;
  const doc = await cfg.model.findById(id);
  if (!doc) throw ApiError.notFound(`${cfg.label} not found`);
  if (patch.assignedTo) {
    const user = await User.exists({ _id: patch.assignedTo, status: "active" });
    if (!user) throw ApiError.badRequest("Assigned user not found");
  }
  const before = doc.get("status");
  if (patch.customer && typeof patch.customer === "object") {
    patch = { ...patch, customer: { ...(doc.get("customer")?.toObject?.() ?? doc.get("customer")), ...(patch.customer as AnyRecord) } };
  }
  doc.set(patch);
  if (patch.status && patch.status !== before && doc.schema.path("statusHistory")) {
    doc.get("statusHistory").push({ status: patch.status, changedBy: userId, changedAt: new Date() });
  }
  await doc.save();
  return { before, after: doc.toObject() as AnyRecord };
}

export async function addCrmNote(kind: CrmKind, id: string, text: string, user: { id: string; name: string }) {
  assertObjectId(id);
  const cfg = CRM[kind] as CrmConfig;
  const doc = await cfg.model.findByIdAndUpdate(
    id,
    { $push: { notes: { text, author: user.id, authorName: user.name, createdAt: new Date() } } },
    { returnDocument: "after" },
  ).lean();
  if (!doc) throw ApiError.notFound(`${cfg.label} not found`);
  return doc;
}

export async function deleteCrmNote(kind: CrmKind, id: string, noteId: string) {
  assertObjectId(id);
  assertObjectId(noteId, "note id");
  const cfg = CRM[kind] as CrmConfig;
  const doc = await cfg.model.findByIdAndUpdate(id, { $pull: { notes: { _id: noteId } } }, { returnDocument: "after" }).lean();
  if (!doc) throw ApiError.notFound(`${cfg.label} not found`);
  return doc;
}

export async function deleteCrm(kind: CrmKind, id: string) {
  assertObjectId(id);
  const cfg = CRM[kind] as CrmConfig;
  const doc = await cfg.model.findByIdAndDelete(id).lean();
  if (!doc) throw ApiError.notFound(`${cfg.label} not found`);
  return doc as AnyRecord;
}

const EXPORT_COLUMNS: Record<CrmKind, { key: string; label: string }[]> = {
  bookings: [
    { key: "reference", label: "Reference" },
    { key: "createdAt", label: "Received" },
    { key: "status", label: "Status" },
    { key: "type", label: "Type" },
    { key: "itemTitle", label: "Item" },
    { key: "customer.name", label: "Name" },
    { key: "customer.email", label: "Email" },
    { key: "customer.phone", label: "Phone" },
    { key: "customer.whatsapp", label: "WhatsApp" },
    { key: "customer.country", label: "Country" },
    { key: "startDate", label: "Start" },
    { key: "endDate", label: "End" },
    { key: "adults", label: "Adults" },
    { key: "children", label: "Children" },
    { key: "pickupLocation", label: "Pickup" },
    { key: "quotedAmount", label: "Quoted" },
    { key: "currency", label: "Currency" },
    { key: "assignedTo.name", label: "Assigned to" },
    { key: "message", label: "Message" },
  ],
  enquiries: [
    { key: "reference", label: "Reference" },
    { key: "createdAt", label: "Received" },
    { key: "status", label: "Status" },
    { key: "personal.firstName", label: "First name" },
    { key: "personal.lastName", label: "Last name" },
    { key: "personal.email", label: "Email" },
    { key: "personal.phone", label: "Phone" },
    { key: "personal.country", label: "Country" },
    { key: "travel.arrivalDate", label: "Arrival" },
    { key: "travel.departureDate", label: "Departure" },
    { key: "travel.durationDays", label: "Days" },
    { key: "travelers.adults", label: "Adults" },
    { key: "travelers.children", label: "Children" },
    { key: "interests", label: "Interests" },
    { key: "hotels.category", label: "Hotels" },
    { key: "budget.amount", label: "Budget" },
    { key: "budget.currency", label: "Budget currency" },
    { key: "assignedTo.name", label: "Assigned to" },
    { key: "additionalRequirements", label: "Requirements" },
  ],
  contacts: [
    { key: "createdAt", label: "Received" },
    { key: "status", label: "Status" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "subject", label: "Subject" },
    { key: "message", label: "Message" },
  ],
};

export async function exportCrm(kind: CrmKind, q: Partial<ListQuery>) {
  const cfg = CRM[kind] as CrmConfig;
  const rows = await cfg.model
    .find(crmFilter(cfg, q))
    .sort({ createdAt: -1 })
    .limit(10_000)
    .populate({ path: "assignedTo", select: "name", strictPopulate: false })
    .lean();
  return toCsv(rows as AnyRecord[], EXPORT_COLUMNS[kind]);
}
