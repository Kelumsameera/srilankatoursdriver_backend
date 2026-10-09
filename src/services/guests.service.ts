import { createHash } from "node:crypto";
import type { Model } from "mongoose";
import { Booking, ContactMessage, Customer, TailorMadeEnquiry } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex, toCsv } from "../utils/helpers.js";
import type { ListQuery } from "../validations/common.js";

/**
 * Guests are people who reached the business without signing in: booking requests that are not linked to
 * an account, tailor-made enquiries and contact messages, grouped by email address. There is no guest
 * collection – a guest is whatever those records say, so edits and erasure are applied to the records.
 * Merged in JS (like the dashboard) for portability across MongoDB-compatible servers.
 */

type Kind = "booking" | "enquiry" | "message";

interface Touch {
  kind: Kind;
  email: string;
  name: string;
  phone: string;
  whatsapp: string;
  country: string;
  createdAt: Date;
}

export interface GuestSummary {
  email: string;
  name: string;
  phone: string;
  whatsapp: string;
  country: string;
  bookings: number;
  enquiries: number;
  messages: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Set when a website account now exists for this address. */
  accountId: string | null;
}

/** Guest bookings only: requests linked to an account belong to Customers → Accounts. */
const GUEST_BOOKING = { account: null };
const ERASED_DOMAIN = "erased.invalid";
const MAX_SCAN = 20_000;

const searchFilter = (fields: string[], search?: string) => {
  if (!search) return {};
  const rx = new RegExp(escapeRegex(search), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
};

async function touches(search?: string): Promise<Touch[]> {
  const [bookings, enquiries, messages] = await Promise.all([
    Booking.find({ ...GUEST_BOOKING, ...searchFilter(["customer.name", "customer.email", "customer.phone"], search) })
      .select("customer createdAt")
      .sort({ createdAt: -1 })
      .limit(MAX_SCAN)
      .lean(),
    TailorMadeEnquiry.find(searchFilter(["personal.firstName", "personal.lastName", "personal.email", "personal.phone"], search))
      .select("personal createdAt")
      .sort({ createdAt: -1 })
      .limit(MAX_SCAN)
      .lean(),
    ContactMessage.find(searchFilter(["name", "email", "phone"], search)).select("name email phone createdAt").sort({ createdAt: -1 }).limit(MAX_SCAN).lean(),
  ]);
  return toTouches(bookings, enquiries, messages).filter((t) => !t.email.endsWith(`@${ERASED_DOMAIN}`));
}

type Contact = { name?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null; country?: string | null };
type Personal = Omit<Contact, "name"> & { firstName?: string | null; lastName?: string | null };

function toTouches(
  bookings: { customer?: Contact | null; createdAt: Date }[],
  enquiries: { personal?: Personal | null; createdAt: Date }[],
  messages: (Contact & { createdAt: Date })[],
): Touch[] {
  const touch = (kind: Kind, c: Contact | null | undefined, createdAt: Date): Touch[] =>
    c?.email ? [{ kind, email: c.email, name: c.name ?? "", phone: c.phone ?? "", whatsapp: c.whatsapp ?? "", country: c.country ?? "", createdAt }] : [];
  return [
    ...bookings.flatMap((b) => touch("booking", b.customer, b.createdAt)),
    ...enquiries.flatMap((e) => touch("enquiry", e.personal && { ...e.personal, name: `${e.personal.firstName ?? ""} ${e.personal.lastName ?? ""}`.trim() }, e.createdAt)),
    ...messages.flatMap((m) => touch("message", { ...m, whatsapp: "", country: "" }, m.createdAt)),
  ];
}

/** One row per email; contact fields come from the most recent record that has them. */
function group(rows: Touch[]) {
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const byEmail = new Map<string, Omit<GuestSummary, "accountId">>();
  for (const t of rows) {
    const email = t.email.toLowerCase();
    let g = byEmail.get(email);
    if (!g) {
      g = { email, name: "", phone: "", whatsapp: "", country: "", bookings: 0, enquiries: 0, messages: 0, firstSeen: t.createdAt, lastSeen: t.createdAt };
      byEmail.set(email, g);
    }
    g.name ||= t.name;
    g.phone ||= t.phone;
    g.whatsapp ||= t.whatsapp;
    g.country ||= t.country;
    if (t.kind === "booking") g.bookings++;
    else if (t.kind === "enquiry") g.enquiries++;
    else g.messages++;
    g.firstSeen = t.createdAt;
  }
  return [...byEmail.values()];
}

async function withAccounts(guests: Omit<GuestSummary, "accountId">[]): Promise<GuestSummary[]> {
  const accounts = guests.length ? await Customer.find({ email: { $in: guests.map((g) => g.email) } }).select("email").lean() : [];
  const ids = new Map(accounts.map((a) => [a.email, String(a._id)]));
  return guests.map((g) => ({ ...g, accountId: ids.get(g.email) ?? null }));
}

const SORTS: Record<string, (a: GuestSummary, b: GuestSummary) => number> = {
  "-lastSeen": (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime(),
  firstSeen: (a, b) => a.firstSeen.getTime() - b.firstSeen.getTime(),
  "-bookings": (a, b) => b.bookings - a.bookings || b.lastSeen.getTime() - a.lastSeen.getTime(),
  name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email),
};

/** `type`: "booked" (has booking requests), "enquiry" (tailor-made / messages only); `status`: "account" / "noAccount". */
async function filteredGuests(q: Pick<ListQuery, "search" | "type" | "status" | "sort">) {
  let guests = await withAccounts(group(await touches(q.search)));
  if (q.type === "booked") guests = guests.filter((g) => g.bookings > 0);
  if (q.type === "enquiry") guests = guests.filter((g) => g.bookings === 0);
  if (q.status === "account") guests = guests.filter((g) => g.accountId);
  if (q.status === "noAccount") guests = guests.filter((g) => !g.accountId);
  return guests.sort(SORTS[q.sort ?? ""] ?? SORTS["-lastSeen"]);
}

export async function listGuests(q: ListQuery) {
  const all = await filteredGuests(q);
  // Headline figures ignore the filters (but not the search), so the tiles stay stable while browsing.
  const everyone = q.type || q.status ? await filteredGuests({ search: q.search }) : all;
  const monthAgo = Date.now() - 30 * 86_400_000;
  return {
    items: all.slice((q.page - 1) * q.limit, q.page * q.limit),
    meta: { page: q.page, limit: q.limit, total: all.length, totalPages: Math.max(1, Math.ceil(all.length / q.limit)) },
    stats: {
      total: everyone.length,
      booked: everyone.filter((g) => g.bookings > 0).length,
      repeat: everyone.filter((g) => g.bookings + g.enquiries + g.messages > 1).length,
      withAccount: everyone.filter((g) => g.accountId).length,
      last30Days: everyone.filter((g) => g.firstSeen.getTime() >= monthAgo).length,
    },
  };
}

const exact = (email: string) => new RegExp(`^${escapeRegex(email)}$`, "i");

/** Everything a guest has sent, newest first. 404 when the address has no guest records. */
export async function getGuest(email: string) {
  const rx = exact(email);
  const [bookings, enquiries, messages] = await Promise.all([
    Booking.find({ ...GUEST_BOOKING, "customer.email": rx })
      .sort({ createdAt: -1 })
      .limit(200)
      .select("reference type itemTitle status startDate adults children quotedAmount currency customer createdAt")
      .lean(),
    TailorMadeEnquiry.find({ "personal.email": rx })
      .sort({ createdAt: -1 })
      .limit(200)
      .select("reference status travel travelers budget personal createdAt")
      .lean(),
    ContactMessage.find({ email: rx }).sort({ createdAt: -1 }).limit(200).select("subject message status name phone email createdAt").lean(),
  ]);
  const [summary] = await withAccounts(group(toTouches(bookings, enquiries, messages)));
  if (!summary) throw ApiError.notFound("Guest not found");
  return {
    ...summary,
    bookings: bookings.map((b) => ({
      _id: String(b._id),
      reference: b.reference,
      type: b.type,
      itemTitle: b.itemTitle,
      status: b.status,
      startDate: b.startDate,
      adults: b.adults,
      children: b.children,
      quotedAmount: b.quotedAmount,
      currency: b.currency,
      createdAt: b.createdAt,
    })),
    enquiries: enquiries.map((e) => ({
      _id: String(e._id),
      reference: e.reference,
      status: e.status,
      arrivalDate: e.travel?.arrivalDate,
      durationDays: e.travel?.durationDays,
      adults: e.travelers?.adults,
      children: e.travelers?.children,
      createdAt: e.createdAt,
    })),
    messages: messages.map((m) => ({ _id: String(m._id), subject: m.subject, message: m.message, status: m.status, createdAt: m.createdAt })),
    counts: { bookings: bookings.length, enquiries: enquiries.length, messages: messages.length },
  };
}

export interface GuestUpdate {
  name?: string;
  phone?: string;
  whatsapp?: string;
  country?: string;
}

/** Applies corrected contact details to every guest record with this address. Returns how many changed. */
export async function updateGuest(email: string, input: GuestUpdate) {
  const rx = exact(email);
  const set = (prefix: string, fields: Partial<Record<keyof GuestUpdate, string>>) =>
    Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => [`${prefix}${k}`, v]));

  // Tailor-made enquiries store first/last name separately; a corrected full name goes into firstName.
  const enquiryName = input.name !== undefined ? { "personal.firstName": input.name, "personal.lastName": "" } : {};
  // An empty $set is an error, so a model with nothing to change is only counted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = (model: Model<any>, filter: Record<string, unknown>, fields: Record<string, unknown>) =>
    Object.keys(fields).length ? model.updateMany(filter, { $set: fields }).then((r) => r.matchedCount) : model.countDocuments(filter);
  const results = await Promise.all([
    apply(Booking, { ...GUEST_BOOKING, "customer.email": rx }, set("customer.", input)),
    apply(TailorMadeEnquiry, { "personal.email": rx }, { ...set("personal.", { phone: input.phone, whatsapp: input.whatsapp, country: input.country }), ...enquiryName }),
    // Contact messages only hold a name and phone.
    apply(ContactMessage, { email: rx }, set("", { name: input.name, phone: input.phone })),
  ]);
  const matched = results.reduce((a, n) => a + n, 0);
  if (!matched) throw ApiError.notFound("Guest not found");
  return matched;
}

/**
 * Right-to-erasure for a guest: removes name, email, phone and free text from all their records. The
 * records themselves stay (with reference, dates and status) so CRM history and reports remain intact.
 */
export async function eraseGuest(email: string) {
  const rx = exact(email);
  const placeholder = `erased-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12)}@${ERASED_DOMAIN}`;
  const name = "Erased guest";
  const [b, e, m] = await Promise.all([
    Booking.updateMany(
      { ...GUEST_BOOKING, "customer.email": rx },
      { $set: { "customer.name": name, "customer.email": placeholder, "customer.phone": "", "customer.whatsapp": "", "customer.country": "", message: "", pickupLocation: "" } },
    ),
    TailorMadeEnquiry.updateMany(
      { "personal.email": rx },
      {
        $set: {
          "personal.firstName": name,
          "personal.lastName": "",
          "personal.email": placeholder,
          "personal.phone": "",
          "personal.whatsapp": "",
          "personal.country": "",
          "arrival.flightNumber": "",
          "departure.flightNumber": "",
          "travelers.childAges": "",
          additionalRequirements: "",
          "hotels.notes": "",
        },
      },
    ),
    ContactMessage.updateMany({ email: rx }, { $set: { name, email: placeholder, phone: "", subject: "", message: "[erased]" } }),
  ]);
  const erased = b.modifiedCount + e.modifiedCount + m.modifiedCount;
  if (!b.matchedCount && !e.matchedCount && !m.matchedCount) throw ApiError.notFound("Guest not found");
  return erased;
}

export async function exportGuests(q: ListQuery) {
  const guests = await filteredGuests(q);
  return toCsv(
    guests.map((g) => ({ ...g, hasAccount: g.accountId ? "yes" : "no" })),
    [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "country", label: "Country" },
      { key: "bookings", label: "Booking requests" },
      { key: "enquiries", label: "Tailor-made enquiries" },
      { key: "messages", label: "Contact messages" },
      { key: "hasAccount", label: "Has account" },
      { key: "firstSeen", label: "First contact" },
      { key: "lastSeen", label: "Last contact" },
    ],
  );
}
