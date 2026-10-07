import { Schema, model } from "mongoose";
import { auditFields, publishableFields } from "./schemas/common.js";

const faqSchema = new Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "General", index: true },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

export const FAQ = model("FAQ", faqSchema);
