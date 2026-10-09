import { Schema, model } from "mongoose";

/** How long raw page views are kept before MongoDB expires them (13 months → year-over-year comparisons). */
export const PAGE_VIEW_RETENTION_DAYS = 400;

/**
 * One public page view. Cookieless and anonymous: no IP, no user agent string and no persistent id is
 * stored. `visitor` is a hash of IP + user agent with a salt that changes daily, so it counts unique
 * visitors per day but cannot follow anyone across days or be reversed. `session` is a random id the
 * browser keeps only for the lifetime of the tab.
 */
const pageViewSchema = new Schema(
  {
    path: { type: String, required: true, maxlength: 300 },
    locale: { type: String, default: "", maxlength: 5 },
    /** Referring site's host for the first view of a session ("" = direct / internal). */
    source: { type: String, default: "", maxlength: 120 },
    /** Whether this view started the session (entry page). */
    entry: { type: Boolean, default: false },
    device: { type: String, enum: ["desktop", "mobile", "tablet"], default: "desktop" },
    browser: { type: String, default: "Other", maxlength: 30 },
    os: { type: String, default: "Other", maxlength: 30 },
    country: { type: String, default: "", maxlength: 2 },
    visitor: { type: String, required: true, maxlength: 32 },
    session: { type: String, required: true, maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

pageViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: PAGE_VIEW_RETENTION_DAYS * 86_400 });
pageViewSchema.index({ createdAt: -1, path: 1 });

export const PageView = model("PageView", pageViewSchema);
