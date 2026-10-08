import { Schema, model } from "mongoose";
import { noteSchema } from "./Booking.js";

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: ["new", "read", "replied", "archived"], default: "new", index: true },
    notes: { type: [noteSchema], default: [] },
    locale: { type: String, default: "en" },
    /** Fingerprint of the public submission – repeated identical submissions are not stored twice. */
    submissionHash: { type: String, select: false },
  },
  { timestamps: true },
);

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ submissionHash: 1, createdAt: -1 });

export const ContactMessage = model("ContactMessage", contactMessageSchema);
