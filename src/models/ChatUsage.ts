import { Schema, model } from "mongoose";

// Gemini usage per day (UTC, "2026-11-03"): used for the daily spending limit and, later, the admin cost report
const chatUsageSchema = new Schema(
  {
    day: { type: String, required: true, unique: true },
    requests: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ChatUsage = model("ChatUsage", chatUsageSchema);
