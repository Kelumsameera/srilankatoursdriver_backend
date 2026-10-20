import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category, Destination, Tour } from "../models/index.js";
import { loadTourImport, mapTour } from "./import-tours.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

try {
  const source = loadTourImport().tours.find((t) => t.slug === "family-escapade-in-sri-lanka");
  if (!source || source.categorySlug !== "family-tours" || source.itineraryReference.length !== 19) throw new Error("Expected confirmed Family route");
  const mapped = mapTour(source);
  await connectDatabase();
  const tour = await Tour.findOne({ slug: source.slug }).lean();
  const category = await Category.findOne({ kind: "tour", slug: "family-tours" }).lean();
  if (!tour || !category) throw new Error("Family tour or category missing");
  if (tour.itinerary.length) throw new Error("Existing itinerary requires review before replacement");
  const locations = source.itineraryReference.map((step) => step.location);
  const destinations = await Destination.find({ status: "published", name: { $in: locations } }).select("_id").lean();
  const patch = {
    shortDescription: mapped.shortDescription, description: mapped.description,
    highlights: mapped.highlights, itinerary: mapped.itinerary,
    startLocation: mapped.startLocation, endLocation: mapped.endLocation,
    destinations: destinations.map((d) => d._id), category: category._id,
  };
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), slug: source.slug, days: mapped.itinerary?.length }));
  if (process.argv.includes("--apply")) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/family-details-${Date.now()}.json`, JSON.stringify(tour, null, 2));
    const result = await Tour.updateOne({ _id: tour._id, updatedAt: tour.updatedAt }, { $set: patch }, { runValidators: true });
    if (result.matchedCount !== 1) throw new Error("Concurrent tour edit");
    revalidateFrontend(CACHE_TAGS.tours, CACHE_TAGS.categories);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
