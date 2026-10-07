import { Schema } from "mongoose";
import { mediaAssetSchema } from "./schemas/common.js";

/**
 * One day of a tour itinerary. Embedded inside Tour (MongoDB best practice for
 * bounded, always-read-together child data), so itineraries load in a single query
 * and are saved atomically with their tour. Supports unlimited days.
 */
export const tourDaySchema = new Schema(
  {
    day: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    overnight: { type: String, trim: true, default: "" },
    distanceKm: Number,
    travelTime: { type: String, trim: true, default: "" },
    meals: { type: [String], default: [] },
    activities: { type: [String], default: [] },
    image: mediaAssetSchema,
  },
  { _id: true },
);
