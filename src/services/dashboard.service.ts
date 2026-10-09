import {
  ActivityLog,
  BlogPost,
  Booking,
  ContactMessage,
  Customer,
  Destination,
  GalleryItem,
  Review,
  TailorMadeEnquiry,
  Tour,
  Vehicle,
} from "../models/index.js";
import { BOOKING_STATUSES } from "../models/Booking.js";

/** Counts per YYYY-MM for the last 12 months (done in JS for portability across MongoDB-compatible servers). */
function groupByMonth(dates: Date[]) {
  const months: { month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), count: 0 });
  }
  const index = new Map(months.map((m, i) => [m.month, i]));
  for (const date of dates) {
    const i = index.get(new Date(date).toISOString().slice(0, 7));
    if (i !== undefined) months[i].count++;
  }
  return months;
}

const WON = new Set(["confirmed", "completed"]);
const LOST = new Set(["cancelled"]);

interface AnalyticsRow {
  createdAt: Date;
  status: string;
  type: string;
  itemTitle?: string;
  adults?: number;
  children?: number;
  quotedAmount?: number;
  currency?: string;
  account?: unknown;
  customer?: { country?: string };
}

/** Top `n` keys of a tally, largest first. */
function top(tally: Map<string, number>, n: number) {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

/** Booking analytics over the last 12 months (computed in JS, like `groupByMonth`). */
function bookingAnalytics(rows: AnalyticsRow[]) {
  const months = groupByMonth([]).map((m) => ({ month: m.month, open: 0, won: 0, lost: 0 }));
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));
  const byStatus = new Map<string, number>();
  const byType = new Map<string, number>();
  const items = new Map<string, number>();
  const countries = new Map<string, number>();
  const revenue = new Map<string, number>();
  let won = 0;
  let lost = 0;
  let travellers = 0;
  let fromAccounts = 0;

  for (const b of rows) {
    const outcome = WON.has(b.status) ? "won" : LOST.has(b.status) ? "lost" : "open";
    const i = monthIndex.get(new Date(b.createdAt).toISOString().slice(0, 7));
    if (i !== undefined) months[i][outcome]++;
    if (outcome === "won") won++;
    if (outcome === "lost") lost++;
    byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
    if (b.itemTitle) items.set(b.itemTitle, (items.get(b.itemTitle) ?? 0) + 1);
    const country = b.customer?.country?.trim();
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
    travellers += (b.adults ?? 1) + (b.children ?? 0);
    if (b.account) fromAccounts++;
    if (outcome === "won" && typeof b.quotedAmount === "number") {
      const cur = b.currency || "USD";
      revenue.set(cur, (revenue.get(cur) ?? 0) + b.quotedAmount);
    }
  }

  const total = rows.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    total,
    monthly: months,
    byStatus: BOOKING_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 })),
    byType: top(byType, 4),
    topItems: top(items, 6),
    topCountries: top(countries, 6),
    revenue: top(revenue, 3).map(({ label, count }) => ({ currency: label, amount: Math.round(count) })),
    kpis: {
      confirmationRate: pct(won),
      cancellationRate: pct(lost),
      openRequests: total - won - lost,
      travellers,
      avgGroupSize: total ? Math.round((travellers / total) * 10) / 10 : 0,
      accountShare: pct(fromAccounts),
    },
  };
}

export async function getDashboardStats() {
  const [
    totalTours,
    publishedTours,
    totalDestinations,
    totalVehicles,
    totalBookings,
    newBookings,
    confirmedBookings,
    tailorMadeEnquiries,
    newEnquiries,
    galleryItems,
    blogPosts,
    reviews,
    pendingReviews,
    newMessages,
    recentBookings,
    recentEnquiries,
    recentActivity,
    bookingsByMonth,
    registeredCustomers,
    upcomingTrips,
  ] = await Promise.all([
    Tour.countDocuments(),
    Tour.countDocuments({ status: "published" }),
    Destination.countDocuments(),
    Vehicle.countDocuments(),
    Booking.countDocuments(),
    Booking.countDocuments({ status: "new" }),
    Booking.countDocuments({ status: "confirmed" }),
    TailorMadeEnquiry.countDocuments(),
    TailorMadeEnquiry.countDocuments({ status: "new" }),
    GalleryItem.countDocuments(),
    BlogPost.countDocuments(),
    Review.countDocuments(),
    Review.countDocuments({ status: "pending" }),
    ContactMessage.countDocuments({ status: "new" }),
    Booking.find().sort({ createdAt: -1 }).limit(6).select("reference customer.name itemTitle type status startDate createdAt").lean(),
    TailorMadeEnquiry.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .select("reference personal.firstName personal.lastName travel.arrivalDate status createdAt")
      .lean(),
    ActivityLog.find().sort({ timestamp: -1 }).limit(12).lean(),
    Booking.find({ createdAt: { $gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) } })
      .select("createdAt status type itemTitle adults children quotedAmount currency account customer.country")
      .lean<AnalyticsRow[]>(),
    Customer.countDocuments(),
    Booking.countDocuments({ status: "confirmed", startDate: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 3600 * 1000) } }),
  ]);

  return {
    cards: {
      totalTours,
      publishedTours,
      totalDestinations,
      totalVehicles,
      totalBookings,
      newBookings,
      confirmedBookings,
      tailorMadeEnquiries,
      newEnquiries,
      galleryItems,
      blogPosts,
      reviews,
      pendingReviews,
      newMessages,
    },
    recentBookings,
    recentEnquiries,
    recentActivity,
    bookingsByMonth: groupByMonth(bookingsByMonth.map((b) => b.createdAt)),
    analytics: { ...bookingAnalytics(bookingsByMonth), registeredCustomers, upcomingTrips },
  };
}
