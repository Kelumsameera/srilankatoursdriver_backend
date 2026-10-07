import { Schema, model } from "mongoose";
import { noteSchema, statusHistorySchema } from "./Booking.js";

export const ENQUIRY_STATUSES = ["new", "processing", "quoted", "confirmed", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

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
    arrival: { type: transferSchema, default: () => ({}) },
    departure: { type: transferSchema, default: () => ({}) },
    destinations: [{ type: Schema.Types.ObjectId, ref: "Destination" }],
    otherDestinations: { type: String, trim: true, default: "" },
    interests: { type: [String], default: [] },
    hotels: {
      category: { type: String, enum: ["budget", "standard", "boutique", "luxury", "mixed"], default: "standard" },
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
  },
  { timestamps: true },
);

tailorMadeEnquirySchema.index({ createdAt: -1 });

export const TailorMadeEnquiry = model("TailorMadeEnquiry", tailorMadeEnquirySchema);
