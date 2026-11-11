import { isLocale } from "../../config/locales.js";
import { escapeHtml } from "../../utils/helpers.js";
import { parsePublicHttpsUrl } from "./email-url.js";

export interface TourBookingEmailContext {
  tour: {
    title: string;
    slug: string;
    shortDescription?: string;
    heroMedia?: { url?: string | null; resourceType?: string } | null;
    gallery?: { url?: string | null; resourceType?: string }[];
    durationDays?: number;
    durationNights?: number;
  };
  locale?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  adults?: number;
  children?: number;
}

function dateLabel(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function numberLabel(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function renderTourCard(context: TourBookingEmailContext, frontendUrl: string): { html: string; text: string } | undefined {
  const { tour } = context;
  const hasControlCharacter = Array.from(tour.slug).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
  if (!tour.title.trim() || !tour.slug.trim() || tour.slug === "." || tour.slug === ".." || /[\\/]/.test(tour.slug) || hasControlCharacter) return undefined;
  const origin = parsePublicHttpsUrl(frontendUrl) ?? new URL("https://srilankatoursdriver.com");
  const locale = isLocale(context.locale) ? context.locale : "en";
  let encodedSlug: string;
  try {
    encodedSlug = encodeURIComponent(tour.slug);
  } catch {
    return undefined;
  }
  const tourUrl = new URL(`/${encodeURIComponent(locale)}/tours/${encodedSlug}`, origin.origin).href;
  const hero = tour.heroMedia;
  const image = hero?.resourceType === "video"
    ? tour.gallery?.find((media) => media.resourceType !== "video" && parsePublicHttpsUrl(media.url))
    : hero;
  const imageUrl = parsePublicHttpsUrl(image?.url)?.href;
  const title = tour.title.trim();
  const description = tour.shortDescription?.trim().slice(0, 400) ?? "";
  const days = numberLabel(tour.durationDays);
  const nights = numberLabel(tour.durationNights);
  const duration = days === undefined ? "" : `${days} day${days === 1 ? "" : "s"}${nights === undefined ? "" : ` · ${nights} night${nights === 1 ? "" : "s"}`}`;
  const startDate = dateLabel(context.startDate);
  const endDate = dateLabel(context.endDate);
  const dates = startDate ? `${startDate}${endDate ? ` – ${endDate}` : ""}` : "";
  const adults = numberLabel(context.adults);
  const children = numberLabel(context.children);
  const travellers = [
    adults === undefined ? "" : `${adults} adult${adults === 1 ? "" : "s"}`,
    children ? `${children} child${children === 1 ? "" : "ren"}` : "",
  ].filter(Boolean).join(", ");
  const summary = [duration, dates && `Dates: ${dates}`, travellers && `Travellers: ${travellers}`].filter(Boolean).join(" · ");
  const imageHtml = imageUrl
    ? `<tr><td style="padding:0"><a href="${escapeHtml(tourUrl)}" style="text-decoration:none"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0"></a></td></tr>`
    : "";
  const summaryHtml = summary ? `<p style="margin:8px 0;color:#475569;font-size:14px;line-height:1.5">${escapeHtml(summary)}</p>` : "";
  const descriptionHtml = description ? `<p style="margin:8px 0 16px;color:#334155;font-size:14px;line-height:1.55">${escapeHtml(description)}</p>` : "";
  const detailsText = [duration, dates && `Dates: ${dates}`, travellers && `Travellers: ${travellers}`, description].filter(Boolean).join("\n");

  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:560px;margin:20px 0;border:1px solid #dbe5e8;border-radius:8px;border-collapse:separate;overflow:hidden;font-family:Arial,sans-serif"><tr><td style="padding:16px 16px 8px"><p style="margin:0;color:#475569;font-size:13px;font-weight:bold">Your selected tour</p></td></tr>${imageHtml}<tr><td style="padding:0 16px 16px"><h3 style="margin:8px 0;color:#032d55;font-size:20px;line-height:1.3"><a href="${escapeHtml(tourUrl)}" style="color:#032d55;text-decoration:none">${escapeHtml(title)}</a></h3>${summaryHtml}${descriptionHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#009f91" style="border-radius:5px"><a href="${escapeHtml(tourUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">View Tour Details</a></td></tr></table></td></tr></table>`,
    text: `Your selected tour\n${title}\n${detailsText ? `${detailsText}\n` : ""}View Tour Details: ${tourUrl}`,
  };
}
