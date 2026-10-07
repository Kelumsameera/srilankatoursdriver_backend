import {
  ActivityLog,
  BlogPost,
  Booking,
  ContactMessage,
  Destination,
  GalleryItem,
  Review,
  TailorMadeEnquiry,
  Tour,
  Vehicle,
} from "../models/index.js";

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
      .select("createdAt")
      .lean(),
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
    bookingsByMonth: groupByMonth(bookingsByMonth.map((b) => b.createdAt as Date)),
  };
}
