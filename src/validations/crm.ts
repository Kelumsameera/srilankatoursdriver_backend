import { z } from "zod";
import { objectId, optionalDate, optionalNumber, optionalRef, shortText } from "./common.js";
import { BOOKING_STATUSES } from "../models/Booking.js";
import { ENQUIRY_STATUSES } from "../models/TailorMadeEnquiry.js";
import { SUPPORTED_LOCALES } from "../config/locales.js";

const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s()-]*$|^$/, "Invalid phone number");

const honeypot = z.string().max(0, "Spam detected").optional();
const locale = z.enum(SUPPORTED_LOCALES).optional();

/* ───────────── Bookings ───────────── */
export const bookingCreate = z
  .object({
    type: z.enum(["tour", "excursion", "vehicle", "general"]).default("general"),
    tour: optionalRef,
    excursion: optionalRef,
    vehicle: optionalRef,
    customer: z.object({
      name: shortText(120).min(2, "Please enter your name"),
      email: z.email("Please enter a valid email").max(254),
      phone: phone.optional(),
      whatsapp: phone.optional(),
      country: shortText(80).optional(),
    }),
    startDate: z.coerce.date(),
    endDate: optionalDate,
    adults: z.number().int().min(1).max(100),
    children: z.number().int().min(0).max(100).optional(),
    pickupLocation: shortText(200).optional(),
    message: shortText(3000).optional(),
    locale,
    website: honeypot,
  })
  .refine((b) => !b.endDate || b.endDate >= b.startDate, { message: "End date must be after start date", path: ["endDate"] })
  .refine((b) => b.startDate.getTime() >= Date.now() - 24 * 3600 * 1000, {
    message: "Start date cannot be in the past",
    path: ["startDate"],
  });

export const bookingAdminUpdate = z
  .object({
    status: z.enum(BOOKING_STATUSES),
    assignedTo: optionalRef,
    quotedAmount: optionalNumber,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    startDate: optionalDate,
    endDate: optionalDate,
    adults: z.number().int().min(1).max(100),
    children: z.number().int().min(0).max(100),
    pickupLocation: shortText(200),
    customer: z
      .object({
        name: shortText(120).min(2),
        email: z.email().max(254),
        phone: phone,
        whatsapp: phone,
        country: shortText(80),
      })
      .partial(),
  })
  .partial();

/* ───────────── Tailor-made ───────────── */
const transfer = z.object({
  airport: shortText(120).optional(),
  flightNumber: shortText(20).optional(),
  time: shortText(20).optional(),
  needsTransfer: z.boolean().optional(),
});

export const tailorMadeCreate = z
  .object({
    personal: z.object({
      firstName: shortText(80).min(1, "First name is required"),
      lastName: shortText(80).optional(),
      email: z.email("Please enter a valid email").max(254),
      phone: phone.optional(),
      whatsapp: phone.optional(),
      country: shortText(80).optional(),
    }),
    travel: z.object({
      arrivalDate: z.coerce.date(),
      departureDate: z.coerce.date(),
      flexibleDates: z.boolean().optional(),
    }),
    travelers: z.object({
      adults: z.number().int().min(1).max(100),
      children: z.number().int().min(0).max(100).optional(),
      infants: z.number().int().min(0).max(50).optional(),
      childAges: shortText(120).optional(),
    }),
    arrival: transfer.optional(),
    departure: transfer.optional(),
    destinations: z.array(objectId).max(40).optional(),
    otherDestinations: shortText(1000).optional(),
    interests: z.array(shortText(60)).max(30).optional(),
    hotels: z
      .object({
        category: z.enum(["budget", "standard", "boutique", "luxury", "mixed"]),
        roomType: shortText(120).optional(),
        notes: shortText(1000).optional(),
      })
      .optional(),
    vehicle: z.object({ vehicleRef: optionalRef, preference: shortText(200).optional() }).optional(),
    budget: z
      .object({
        amount: optionalNumber,
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
        perPerson: z.boolean().optional(),
        range: shortText(80).optional(),
      })
      .optional(),
    additionalRequirements: shortText(5000).optional(),
    locale,
    website: honeypot,
  })
  .refine((v) => v.travel.departureDate > v.travel.arrivalDate, {
    message: "Departure must be after arrival",
    path: ["travel", "departureDate"],
  })
  .refine((v) => v.travel.arrivalDate.getTime() >= Date.now() - 24 * 3600 * 1000, {
    message: "Arrival date cannot be in the past",
    path: ["travel", "arrivalDate"],
  });

export const tailorMadeAdminUpdate = z
  .object({
    status: z.enum(ENQUIRY_STATUSES),
    assignedTo: optionalRef,
    quotedAmount: optionalNumber,
  })
  .partial();

/* ───────────── Contact ───────────── */
export const contactCreate = z.object({
  name: shortText(120).min(2),
  email: z.email().max(254),
  phone: phone.optional(),
  subject: shortText(200).optional(),
  message: shortText(5000).min(10, "Message must be at least 10 characters"),
  locale,
  website: honeypot,
});

export const contactAdminUpdate = z.object({ status: z.enum(["new", "read", "replied", "archived"]) });
