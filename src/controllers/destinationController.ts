import type { NextFunction, Request, Response } from "express";
import { Destination } from "../models/Destination.js";
import { getPublicBySlug, listPublicLocalized, localizeCategories, PUBLIC_RESOURCES } from "../services/public.service.js";
import { localize } from "../services/translation/translation.service.js";
import { ApiError } from "../utils/ApiError.js";
import { readLocale, readQuery } from "./publicRequest.js";

type Location = { lat: number; lng: number };

// true when the destination has both a latitude and a longitude
function hasLocation(location: unknown): location is Location {
  const point = location as Partial<Location> | undefined;
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

// Straight-line distance between two points on the earth, in km
function distanceInKm(from: Location, to: Location) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDifference = toRadians(to.lat - from.lat);
  const lngDifference = toRadians(to.lng - from.lng);
  const h = Math.sin(latDifference / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDifference / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

//GET /api/destinations
export async function getDestinations(req: Request, res: Response, next: NextFunction) {
  try {
    const query = readQuery(req);
    const result = await listPublicLocalized("destinations", {
      locale: readLocale(req),
      page: query.page,
      limit: query.limit,
      featured: query.featured === "true",
      category: query.category,
      destination: query.destination,
      search: query.search ?? query.q,
      platform: query.platform,
    });
    res.json({ success: true, message: "OK", data: result.items, meta: result.meta });
  } catch (error) {
    // The shared error handler sends the same error JSON as every other route
    next(error);
  }
}

//GET /api/destinations/:slug
export async function getDestinationBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const destination = await getPublicBySlug("destinations", String(req.params.slug), readLocale(req));
    res.json({ success: true, message: "OK", data: destination });
  } catch (error) {
    next(error);
  }
}

//GET /api/destinations/:slug/nearby
// The closest published destinations. Ones without a map location come after, same category first.
export async function getNearbyDestinations(req: Request, res: Response, next: NextFunction) {
  try {
    const locale = readLocale(req);
    const limit = Math.min(readQuery(req).limit ?? 6, 12);
    const settings = PUBLIC_RESOURCES.destinations;

    const destination = await Destination.findOne({ status: "published", slug: String(req.params.slug).toLowerCase() })
      .select("location category")
      .lean();
    if (!destination) throw ApiError.notFound("Not found");

    const others = await Destination.find({ status: "published", _id: { $ne: destination._id } })
      .select(settings.listSelect)
      .populate(settings.populate[0])
      .sort(settings.sort)
      .lean();

    // Work out the distance to every other destination (null when one of them has no location)
    const withDistance = others.map((other, index) => ({
      other,
      index,
      km: hasLocation(destination.location) && hasLocation(other.location) ? distanceInKm(destination.location, other.location) : null,
    }));

    const isSameCategory = (other: (typeof others)[number]) =>
      String((other.category as { _id?: unknown } | undefined)?._id ?? "") === String(destination.category ?? "-");

    // Closest first. Destinations without a distance go last: same category first, then the normal order.
    withDistance.sort((a, b) => {
      if (a.km != null && b.km != null) return a.km - b.km;
      if (a.km != null) return -1;
      if (b.km != null) return 1;
      return Number(isSameCategory(b.other)) - Number(isSameCategory(a.other)) || a.index - b.index;
    });

    const nearby = withDistance
      .slice(0, limit)
      .map(({ other, km }) => ({ ...other, distanceKm: km == null ? null : Math.round(km) }));

    // Translate the names / descriptions and the category names into the visitor's language
    const translated = await localize("destination", nearby, locale);
    res.json({ success: true, message: "OK", data: await localizeCategories(translated, locale) });
  } catch (error) {
    next(error);
  }
}
