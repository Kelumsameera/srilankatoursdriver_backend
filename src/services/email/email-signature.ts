import { escapeHtml } from "../../utils/helpers.js";

const WEBSITE = "https://srilankatoursdriver.com";
const AWARD_ASSETS = "https://srilankatoursdriver.vercel.app/images/awards";
const PROFILE = "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews-Sri_Lanka_Tours_Driver-Colombo_Western_Province.html";
const LOGO = "https://srilankatoursdriver.vercel.app/images/branding/sri-lanka-emblem-512.png";

function publicHttps(value: string | undefined, fallback: string): string {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

/** Inline styles and a table keep the signature readable in common email clients. */
export function buildEmailSignature(name: string, logoUrl?: string, websiteUrl?: string, awards: { year: number; name: string; sourceUrl: string }[] = []) {
  const website = publicHttps(websiteUrl, WEBSITE);
  const logo = publicHttps(logoUrl, LOGO);
  const years = [...new Set(awards.filter((award) => Number.isInteger(award.year) && award.year >= 2000 && award.year <= 2100 && /travell?ers.? choice/i.test(award.name)).map((award) => award.year))].sort((a, b) => a - b);
  const awardText = years.length ? `Tripadvisor Travelers' Choice winner: ${years.join(" | ")}` : "";
  const badges = years.filter((year) => [2024, 2025, 2026].includes(year)).map((year) => {
    const award = awards.find((item) => item.year === year)!;
    const link = publicHttps(award.sourceUrl, PROFILE);
    return `<td style="padding-right:12px;vertical-align:top"><a href="${escapeHtml(link)}"><img src="${AWARD_ASSETS}/tripadvisor-choice-${year}.png" alt="Tripadvisor Travelers' Choice Awards ${year}" width="108" height="122" style="display:block;width:108px;height:auto;border:0"></a></td>`;
  }).join("");
  const awardHtml = awardText ? `<div style="margin-bottom:18px"><p style="margin:0 0 8px;font-weight:bold">${escapeHtml(awardText)}</p>${badges ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${badges}</tr></table>` : ""}<p style="margin:8px 0 0"><a href="${PROFILE}" style="color:#009f91">Tripadvisor: Sri Lanka Tours Driver</a></p></div>` : "";
  return {
    html: `<div style="margin-top:28px;font-family:Arial,sans-serif;font-size:14px;color:#334155"><p style="margin:0 0 12px">Best regards,</p>${awardHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:14px;vertical-align:top"><a href="${escapeHtml(website)}"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)} logo" width="64" style="display:block;width:64px;height:auto;border:0"></a></td><td style="vertical-align:top"><strong style="font-size:16px;color:#032d55">${escapeHtml(name)}</strong><br><a href="mailto:info@srilankatoursdriver.com" style="color:#009f91;text-decoration:none">info@srilankatoursdriver.com</a><br><a href="${escapeHtml(website)}" style="color:#009f91;text-decoration:none">${escapeHtml(new URL(website).hostname)}</a></td></tr></table></div>`,
    text: `Best regards,\n${name}\ninfo@srilankatoursdriver.com\n${website}${awardText ? `\n\n${awardText}\n${PROFILE}` : ""}`,
  };
}
