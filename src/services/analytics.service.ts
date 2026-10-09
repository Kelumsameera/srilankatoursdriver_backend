import type { PipelineStage } from "mongoose";
import { Booking, Customer, PageView, TailorMadeEnquiry } from "../models/index.js";
import { allowedOrigins, env } from "../config/env.js";
import { sha256 } from "../utils/helpers.js";
import type { AnalyticsRange } from "../validations/analytics.js";

/* ───────────────────────── Recording ───────────────────────── */

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|preview|facebookexternalhit|whatsapp|curl|wget|python|axios|node-fetch|go-http|java\//i;

export function parseUserAgent(ua: string) {
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? "tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome|CriOS/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : "Other";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Other";
  return { device: device as "desktop" | "mobile" | "tablet", browser, os };
}

const ownHosts = new Set(
  allowedOrigins.flatMap((o) => {
    try {
      return [new URL(o).hostname.replace(/^www\./, "")];
    } catch {
      return [];
    }
  }),
);

/** Referring site's host ("" for direct visits and links from this site). */
export function referrerSource(referrer?: string, utmSource?: string) {
  if (utmSource) return utmSource.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
  if (!referrer) return "";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    return ownHosts.has(host) ? "" : host.slice(0, 120);
  } catch {
    return "";
  }
}

/** Salt rotates every UTC day, so visitor hashes cannot be linked across days (or reversed to an IP). */
const dailySalt = () => sha256(`page-view:${env.JWT_REFRESH_SECRET}:${new Date().toISOString().slice(0, 10)}`);

export async function recordPageView(
  input: { path: string; locale?: string; referrer?: string; utmSource?: string; session: string; entry?: boolean },
  client: { ip?: string; userAgent: string; country?: string },
) {
  if (!client.userAgent || BOT_UA.test(client.userAgent)) return;
  await PageView.create({
    path: input.path.length > 1 ? input.path.replace(/\/+$/, "") : input.path,
    locale: input.locale ?? "",
    source: input.entry ? referrerSource(input.referrer, input.utmSource) : "",
    entry: !!input.entry,
    ...parseUserAgent(client.userAgent),
    country: client.country ?? "",
    visitor: sha256(`${dailySalt()}|${client.ip ?? ""}|${client.userAgent}`).slice(0, 32),
    session: input.session,
  });
}

/* ───────────────────────── Reporting ───────────────────────── */

/** Reports are bucketed in the business's time zone (Sri Lanka, UTC+5:30, no DST). */
const TZ = "Asia/Colombo";
const TZ_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

type Granularity = "day" | "month";

interface Period {
  from: Date;
  to: Date;
  keys: string[];
}

const localDayKey = (t: number) => new Date(t + TZ_OFFSET_MS).toISOString().slice(0, 10);
const startOfLocalDay = (t: number) => Math.floor((t + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
const startOfLocalMonth = (year: number, month: number) => Date.UTC(year, month, 1) - TZ_OFFSET_MS;

/** The current period and the equally long one before it, with every bucket key (so empty days still plot). */
function periods(range: AnalyticsRange, now = Date.now()): { granularity: Granularity; current: Period; previous: Period } {
  if (range === "12m") {
    const local = new Date(now + TZ_OFFSET_MS);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const build = (offset: number): Period => {
      const keys = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 11 - offset + i, 1)).toISOString().slice(0, 7));
      return { from: new Date(startOfLocalMonth(y, m - 11 - offset)), to: new Date(startOfLocalMonth(y, m + 1 - offset)), keys };
    };
    return { granularity: "month", current: build(0), previous: build(12) };
  }
  const days = Number.parseInt(range, 10);
  const todayStart = startOfLocalDay(now);
  const build = (offset: number): Period => {
    const from = todayStart - (days - 1 + offset) * DAY_MS;
    return { from: new Date(from), to: new Date(from + days * DAY_MS), keys: Array.from({ length: days }, (_, i) => localDayKey(from + i * DAY_MS)) };
  };
  return { granularity: "day", current: build(0), previous: build(days) };
}

const bucketExpr = (g: Granularity) => ({ $dateToString: { format: g === "day" ? "%Y-%m-%d" : "%Y-%m", date: "$createdAt", timezone: TZ } });
const dayExpr = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } };
const inPeriod = (p: Period) => ({ createdAt: { $gte: p.from, $lt: p.to } });

/** Visitors (unique per day) and page views per bucket. */
async function trafficSeries(p: Period, g: Granularity) {
  const rows = await PageView.aggregate<{ _id: string; visitors: number; pageviews: number }>([
    { $match: inPeriod(p) },
    { $group: { _id: { b: bucketExpr(g), d: dayExpr, v: "$visitor" }, views: { $sum: 1 } } },
    { $group: { _id: "$_id.b", visitors: { $sum: 1 }, pageviews: { $sum: "$views" } } },
  ]);
  const byKey = new Map(rows.map((r) => [r._id, r]));
  return p.keys.map((key) => ({ key, visitors: byKey.get(key)?.visitors ?? 0, pageviews: byKey.get(key)?.pageviews ?? 0 }));
}

async function sessionTotals(p: Period) {
  const [row] = await PageView.aggregate<{ sessions: number; bounces: number }>([
    { $match: inPeriod(p) },
    { $group: { _id: "$session", views: { $sum: 1 } } },
    { $group: { _id: null, sessions: { $sum: 1 }, bounces: { $sum: { $cond: [{ $eq: ["$views", 1] }, 1, 0] } } } },
  ]);
  return { sessions: row?.sessions ?? 0, bounces: row?.bounces ?? 0 };
}

/** Counts per bucket for any collection with a `createdAt`. */
function countSeries(dates: Date[], p: Period, g: Granularity) {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = g === "day" ? localDayKey(d.getTime()) : localDayKey(d.getTime()).slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return p.keys.map((k) => counts.get(k) ?? 0);
}

/** Top values of one page-view field, counted per session (entry views) or per view. */
async function breakdown(p: Period, field: string, opts: { entryOnly?: boolean; limit?: number } = {}) {
  const pipeline: PipelineStage[] = [
    { $match: { ...inPeriod(p), ...(opts.entryOnly ? { entry: true } : {}) } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: opts.limit ?? 8 },
  ];
  const rows = await PageView.aggregate<{ _id: string; count: number }>(pipeline);
  return rows.map((r) => ({ label: r._id ?? "", count: r.count }));
}

async function topPages(p: Period) {
  const rows = await PageView.aggregate<{ _id: string; views: number; visitors: number; entries: number }>([
    { $match: inPeriod(p) },
    { $group: { _id: { path: "$path", d: dayExpr, v: "$visitor" }, views: { $sum: 1 }, entries: { $sum: { $cond: ["$entry", 1, 0] } } } },
    { $group: { _id: "$_id.path", views: { $sum: "$views" }, visitors: { $sum: 1 }, entries: { $sum: "$entries" } } },
    { $sort: { views: -1 } },
    { $limit: 10 },
  ]);
  return rows.map((r) => ({ path: r._id, views: r.views, visitors: r.visitors, entries: r.entries }));
}

/** Page views by local weekday (Mon = 0) and hour. */
async function heatmap(p: Period) {
  const rows = await PageView.aggregate<{ _id: { dow: number; hour: number }; count: number }>([
    { $match: inPeriod(p) },
    { $group: { _id: { dow: { $dayOfWeek: { date: "$createdAt", timezone: TZ } }, hour: { $hour: { date: "$createdAt", timezone: TZ } } }, count: { $sum: 1 } } },
  ]);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  // $dayOfWeek: 1 = Sunday … 7 = Saturday → Monday-first rows.
  for (const r of rows) grid[(r._id.dow + 5) % 7][r._id.hour] = r.count;
  return grid;
}

async function uniqueVisitors(match: Record<string, unknown>) {
  const [row] = await PageView.aggregate<{ n: number }>([{ $match: match }, { $group: { _id: { d: dayExpr, v: "$visitor" } } }, { $count: "n" }]);
  return row?.n ?? 0;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export async function getAnalytics(range: AnalyticsRange) {
  const { granularity: g, current, previous } = periods(range);
  const createdIn = (p: Period) => ({ createdAt: { $gte: p.from, $lt: p.to } });

  const [
    traffic,
    prevTraffic,
    sessions,
    prevSessions,
    bookings,
    prevBookings,
    signups,
    prevSignups,
    enquiries,
    customersBefore,
    pages,
    sources,
    devices,
    browsers,
    os,
    countries,
    locales,
    hours,
    bookingPageVisitors,
    live,
  ] = await Promise.all([
    trafficSeries(current, g),
    trafficSeries(previous, g),
    sessionTotals(current),
    sessionTotals(previous),
    Booking.find(createdIn(current)).select("createdAt status").lean(),
    Booking.countDocuments(createdIn(previous)),
    Customer.find(createdIn(current)).select("createdAt").lean(),
    Customer.countDocuments(createdIn(previous)),
    TailorMadeEnquiry.find(createdIn(current)).select("createdAt").lean(),
    Customer.countDocuments({ createdAt: { $lt: current.from } }),
    topPages(current),
    breakdown(current, "source", { entryOnly: true }),
    breakdown(current, "device", { entryOnly: true }),
    breakdown(current, "browser", { entryOnly: true, limit: 6 }),
    breakdown(current, "os", { entryOnly: true, limit: 6 }),
    breakdown(current, "country", { entryOnly: true, limit: 10 }),
    breakdown(current, "locale", { entryOnly: true }),
    heatmap(current),
    uniqueVisitors({ ...inPeriod(current), path: { $regex: "^/booking" } }),
    PageView.distinct("visitor", { createdAt: { $gte: new Date(Date.now() - 5 * 60_000) } }).then((v) => v.length),
  ]);

  const sum = (rows: { visitors: number; pageviews: number }[], k: "visitors" | "pageviews") => rows.reduce((s, r) => s + r[k], 0);
  const visitors = sum(traffic, "visitors");
  const prevVisitors = sum(prevTraffic, "visitors");
  const pageviews = sum(traffic, "pageviews");
  const prevPageviews = sum(prevTraffic, "pageviews");

  const bookingCounts = countSeries(bookings.map((b) => b.createdAt as Date), current, g);
  const signupCounts = countSeries(signups.map((c) => c.createdAt as Date), current, g);
  const enquiryCounts = countSeries(enquiries.map((e) => e.createdAt as Date), current, g);
  let runningCustomers = customersBefore;
  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed").length;

  return {
    range,
    granularity: g,
    from: current.from,
    to: current.to,
    live,
    kpis: {
      visitors: { value: visitors, previous: prevVisitors },
      pageviews: { value: pageviews, previous: prevPageviews },
      sessions: { value: sessions.sessions, previous: prevSessions.sessions },
      viewsPerSession: {
        value: sessions.sessions ? Math.round((pageviews / sessions.sessions) * 10) / 10 : 0,
        previous: prevSessions.sessions ? Math.round((prevPageviews / prevSessions.sessions) * 10) / 10 : 0,
      },
      bounceRate: { value: pct(sessions.bounces, sessions.sessions), previous: pct(prevSessions.bounces, prevSessions.sessions) },
      bookings: { value: bookings.length, previous: prevBookings },
      conversionRate: { value: pct(bookings.length, visitors), previous: pct(prevBookings, prevVisitors) },
      signups: { value: signups.length, previous: prevSignups },
    },
    series: traffic.map((t, i) => {
      runningCustomers += signupCounts[i];
      return {
        key: t.key,
        visitors: t.visitors,
        pageviews: t.pageviews,
        bookings: bookingCounts[i],
        signups: signupCounts[i],
        enquiries: enquiryCounts[i],
        customers: runningCustomers,
      };
    }),
    previousSeries: prevTraffic.map((t) => ({ key: t.key, visitors: t.visitors, pageviews: t.pageviews })),
    topPages: pages,
    sources: sources.map((s) => ({ label: s.label || "Direct / none", count: s.count })),
    devices,
    browsers,
    os,
    countries: countries.map((c) => ({ label: c.label || "Unknown", count: c.count })),
    locales: locales.map((l) => ({ label: l.label || "—", count: l.count })),
    heatmap: hours,
    funnel: [
      { label: "Visitors", value: visitors },
      { label: "Viewed the booking page", value: bookingPageVisitors },
      { label: "Sent a booking request", value: bookings.length },
      { label: "Confirmed / completed", value: confirmed },
    ],
  };
}
