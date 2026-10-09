import { Schema, model } from "mongoose";

export const BOOKING_STATUSES = ["new", "contacted", "quoted", "pending", "confirmed", "cancelled", "completed"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const noteSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    author: { type: Schema.Types.ObjectId, ref: "User" },
    authorName: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

export const statusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    type: { type: String, enum: ["tour", "excursion", "vehicle", "general"], default: "general", index: true },
    tour: { type: Schema.Types.ObjectId, ref: "Tour" },
    excursion: { type: Schema.Types.ObjectId, ref: "Excursion" },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    itemTitle: { type: String, trim: true, default: "" },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, trim: true, default: "" },
      whatsapp: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "" },
    },
    /** Website account that submitted the request while signed in (guests: unset). Drives "My bookings". */
    account: { type: Schema.Types.ObjectId, ref: "Customer", index: true },
    startDate: Date,
    endDate: Date,
    adults: { type: Number, min: 1, default: 1 },
    children: { type: Number, min: 0, default: 0 },
    pickupLocation: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    status: { type: String, enum: BOOKING_STATUSES, default: "new", index: true },
    quotedAmount: Number,
    currency: { type: String, default: "USD" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    notes: { type: [noteSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    locale: { type: String, default: "en" },
    /** Fingerprint of the public submission – repeated identical submissions are not stored twice. */
    submissionHash: { type: String, select: false },
    source: { type: String, default: "website" },
  },
  { timestamps: true },
);

bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ submissionHash: 1, createdAt: -1 });
bookingSchema.index({ "customer.email": 1 });

export const Booking = model("Booking", bookingSchema);
