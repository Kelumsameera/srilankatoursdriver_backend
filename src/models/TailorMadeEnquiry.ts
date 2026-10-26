import { Schema, model } from "mongoose";
import { noteSchema, statusHistorySchema } from "./Booking.js";

export const ENQUIRY_STATUSES = ["new", "processing", "quoted", "confirmed", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Choices of the public tailor-made form (labels live in the frontend messages). */
export const TRAVEL_TYPES = ["alone", "couple", "family", "friends"] as const;
export const VEHICLE_TYPES = ["car", "van", "bus"] as const;
export const TRANSPORT_METHODS = ["driver", "driverGuide"] as const;
export const HOLIDAY_TYPES = ["nature", "culture", "beach", "trekking", "activity", "boat", "train", "factory", "waterSports", "diving", "whales"] as const;
export const ACCOMMODATION_TYPES = ["3star", "4star", "5star", "own"] as const;
export const MEAL_PLANS = ["bb", "hb", "fb"] as const;
export const EXTRA_SERVICES = ["trainTickets", "entranceTickets", "airportTransfer"] as const;

const transferSchema = new Schema(
  {
    airport: { type: String, trim: true, default: "" },
    flightNumber: { type: String, trim: true, default: "" },
    time: { type: String, trim: true, default: "" },
    needsTransfer: { type: Boolean, default: true },
  },
  { _id: false },
);

const tailorMadeEnquirySchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    personal: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, trim: true, default: "" },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, trim: true, default: "" },
      whatsapp: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "" },
    },
    travel: {
      arrivalDate: Date,
      departureDate: Date,
      flexibleDates: { type: Boolean, default: false },
      durationDays: Number,
    },
    travelers: {
      adults: { type: Number, min: 1, default: 2 },
      children: { type: Number, min: 0, default: 0 },
      infants: { type: Number, min: 0, default: 0 },
      childAges: { type: String, trim: true, default: "" },
    },
    /** Older enquiries only – the current form asks for an airport transfer under `services`. */
    arrival: { type: transferSchema },
    departure: { type: transferSchema },
    destinations: [{ type: Schema.Types.ObjectId, ref: "Destination" }],
    otherDestinations: { type: String, trim: true, default: "" },
    trip: {
      travelType: { type: String, enum: TRAVEL_TYPES },
      vehicleType: { type: String, enum: VEHICLE_TYPES },
      transportMethod: { type: String, enum: TRANSPORT_METHODS },
    },
    /** Holiday types chosen on the form (older enquiries: free interest keys). */
    interests: { type: [String], default: [] },
    accommodation: { type: String, enum: ACCOMMODATION_TYPES },
    mealPlan: { type: String, enum: MEAL_PLANS },
    services: { type: [String], enum: EXTRA_SERVICES, default: [] },
    /** Older enquiries only – the current form asks for `accommodation` instead. */
    hotels: {
      category: { type: String, enum: ["budget", "standard", "boutique", "luxury", "mixed"] },
      roomType: { type: String, trim: true, default: "" },
      notes: { type: String, trim: true, default: "" },
    },
    vehicle: {
      vehicleRef: { type: Schema.Types.ObjectId, ref: "Vehicle" },
      preference: { type: String, trim: true, default: "" },
    },
    budget: {
      amount: Number,
      currency: { type: String, default: "USD" },
      perPerson: { type: Boolean, default: true },
      range: { type: String, trim: true, default: "" },
    },
    additionalRequirements: { type: String, trim: true, default: "" },
    status: { type: String, enum: ENQUIRY_STATUSES, default: "new", index: true },
    quotedAmount: Number,
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: [noteSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    locale: { type: String, default: "en" },
    /** Fingerprint of the public submission – repeated identical submissions are not stored twice. */
    submissionHash: { type: String, select: false },
  },
  { timestamps: true },
);

tailorMadeEnquirySchema.index({ createdAt: -1 });
tailorMadeEnquirySchema.index({ submissionHash: 1, createdAt: -1 });

export const TailorMadeEnquiry = model("TailorMadeEnquiry", tailorMadeEnquirySchema);
