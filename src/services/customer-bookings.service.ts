import { Booking } from "../models/Booking.js";
import { Customer } from "../models/Customer.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * A customer's own booking requests: those submitted while signed in, plus – once the email address is
 * proven (Google sign-in or a password reset) – guest requests made with that address. Unverified
 * accounts never see email-matched bookings, so registering someone else's address reveals nothing.
 * Internal notes, assignee and who changed a status stay admin-only.
 */
export async function listCustomerBookings(customerId: string) {
  const customer = await Customer.findById(customerId).select("email emailVerified").lean();
  if (!customer) throw ApiError.notFound("Account not found");
  const match = customer.emailVerified ? { $or: [{ account: customer._id }, { "customer.email": customer.email }] } : { account: customer._id };
  const bookings = await Booking.find(match)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("reference type itemTitle startDate endDate adults children pickupLocation status quotedAmount currency statusHistory createdAt")
    .lean();
  return bookings.map((b) => ({
    id: String(b._id),
    reference: b.reference,
    type: b.type,
    itemTitle: b.itemTitle,
    startDate: b.startDate,
    endDate: b.endDate,
    adults: b.adults,
    children: b.children,
    pickupLocation: b.pickupLocation,
    status: b.status,
    // A quote is only meaningful to the customer once it has been sent.
    quotedAmount: b.status === "new" || b.status === "contacted" ? undefined : b.quotedAmount,
    currency: b.currency,
    statusHistory: (b.statusHistory ?? []).map((h) => ({ status: h.status, changedAt: h.changedAt })),
    createdAt: b.createdAt,
  }));
}
