import { escapeHtml } from "../../utils/helpers.js";
import { parsePublicHttpsUrl } from "./email-url.js";

const WEBSITE = "https://srilankatoursdriver.com";
const WHATSAPP = "https://wa.me/94769300334";
const PHONE = "0094769300334";
const LOCATION = "Bandaragama, Sri Lanka";
const FOUNDER = "Thanuja Dinushanka";
const BADGE_WIDTH = 72;
const AWARD_IMAGES: Record<number, { url: string; width: number; height: number }> = {
  "2024": {
    "url": "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794258363/srilankatoursdriver/branding/tripadvisor-choice-2024_cw0y42.png",
    "width": 600,
    "height": 600
  },
  "2025": {
    "url": "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794258366/srilankatoursdriver/branding/tripadvisor-choice-2025_yra1i9.png",
    "width": 1830,
    "height": 1930
  },
  "2026": {
    "url": "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794258367/srilankatoursdriver/branding/tripadvisor-choice-2026_zptfth.png",
    "width": 1009,
    "height": 1174
  }
};
const PROFILE = "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews-Sri_Lanka_Tours_Driver-Colombo_Western_Province.html";
const LOGO = "https://srilankatoursdriver.vercel.app/images/branding/sri-lanka-emblem-512.png";

function publicHttps(value: string | undefined, fallback: string): string {
  return parsePublicHttpsUrl(value)?.href ?? fallback;
}

type SocialNetwork = "facebook" | "instagram" | "youtube" | "tiktok" | "tripadvisor" | "twitter" | "linkedin" | "pinterest";
const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  tripadvisor: "Tripadvisor",
  twitter: "X",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};
const SOCIAL_ICON_IMAGES: Record<SocialNetwork, string> = {
  facebook: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426450/srilankatoursdriver/branding/email-social-facebook.png",
  instagram: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426451/srilankatoursdriver/branding/email-social-instagram.png",
  youtube: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426452/srilankatoursdriver/branding/email-social-youtube.png",
  tiktok: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426453/srilankatoursdriver/branding/email-social-tiktok.png",
  tripadvisor: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426454/srilankatoursdriver/branding/email-social-tripadvisor.png",
  twitter: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426454/srilankatoursdriver/branding/email-social-twitter.png",
  linkedin: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426455/srilankatoursdriver/branding/email-social-linkedin.png",
  pinterest: "https://res.cloudinary.com/m3vlxnsr/image/upload/v1794426456/srilankatoursdriver/branding/email-social-pinterest.png",
};

/** Inline styles and a table keep the signature readable in common email clients. */
export function buildEmailSignature(
  name: string,
  logoUrl?: string,
  websiteUrl?: string,
  awards: { year: number; name: string; sourceUrl: string }[] = [],
  social: Partial<Record<SocialNetwork, string | null>> | null = {},
  tripadvisorProfileUrl?: string,
) {
  const website = publicHttps(websiteUrl, WEBSITE);
  const logo = publicHttps(logoUrl, LOGO);
  const profile = publicHttps(tripadvisorProfileUrl, PROFILE);
  const years = [...new Set(awards.filter((award) => Number.isInteger(award.year) && award.year >= 2000 && award.year <= 2100 && /travell?ers.? choice/i.test(award.name)).map((award) => award.year))].sort((a, b) => a - b);
  const awardText = years.length ? `We are Travelers' Choice on Tripadvisor (${years.join(" | ")})` : "";
  const badges = years.filter((year) => AWARD_IMAGES[year]).map((year) => {
    const award = awards.find((item) => item.year === year)!;
    const link = publicHttps(award.sourceUrl, profile);
    return `<td style="padding-right:8px;vertical-align:top"><a href="${escapeHtml(link)}"><img src="${escapeHtml(AWARD_IMAGES[year].url)}" alt="Tripadvisor Travelers' Choice Awards ${year}" width="${BADGE_WIDTH}" height="${Math.round(BADGE_WIDTH * AWARD_IMAGES[year].height / AWARD_IMAGES[year].width)}" style="display:block;width:${BADGE_WIDTH}px;height:auto;border:0"></a></td>`;
  }).join("");
  const awardHtml = `${awardText ? `<div style="margin-bottom:14px"><p style="margin:0 0 6px;font-weight:bold">${escapeHtml(awardText)}</p>${badges ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${badges}</tr></table>` : ""}</div>` : ""}<p style="margin:6px 0 14px"><a href="${escapeHtml(profile)}" style="color:#009f91">Tripadvisor: Sri Lanka Tours Driver</a></p>`;
  const socialLinks = (Object.keys(SOCIAL_LABELS) as SocialNetwork[]).flatMap((network) => {
    const url = parsePublicHttpsUrl(social?.[network]);
    if (!url) return [];
    const label = SOCIAL_LABELS[network];
    const icon = SOCIAL_ICON_IMAGES[network];
    return [{ network, label, url: url.href, icon }];
  });
  const socialHtml = socialLinks.length
    ? `<tr><td colspan="2" style="padding-top:10px"><p style="margin:0 0 6px;color:#475569;font-size:13px">Follow us</p><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${socialLinks.map(({ label, url, icon }) => `<td style="padding:0 8px 0 0"><a href="${escapeHtml(url)}" title="${escapeHtml(label)}" style="display:block;color:#009f91;text-decoration:none"><img src="${escapeHtml(icon)}" alt="${escapeHtml(`Follow us on ${label}`)}" width="22" height="22" style="display:block;width:22px;height:22px;border:0"></a></td>`).join("")}</tr></table></td></tr>`
    : "";
  const contactHtml = `<strong style="font-size:16px;color:#032d55">${escapeHtml(FOUNDER)}</strong><br><span style="color:#475569">Founder &amp; CEO (Sri Lanka Tours Driver)</span><br><span style="color:#475569">${escapeHtml(LOCATION)}</span><br><a href="tel:+94769300334" style="color:#009f91;text-decoration:none">Voice/WhatsApp: ${PHONE}</a><br><a href="mailto:info@srilankatoursdriver.com" style="color:#009f91;text-decoration:none">info@srilankatoursdriver.com</a><br><a href="${escapeHtml(website)}" style="color:#009f91;text-decoration:none">Web: ${escapeHtml(new URL(website).hostname)}</a><br><a href="${WHATSAPP}" style="color:#009f91;text-decoration:none">WhatsApp</a>`;
  return {
    html: `<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#334155"><p style="margin:0 0 10px">Best regards,</p>${awardHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:top"><a href="${escapeHtml(website)}"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)} logo" width="56" style="display:block;width:56px;height:auto;border:0"></a></td><td style="vertical-align:top">${contactHtml}</td></tr>${socialHtml}</table></div>`,
    text: `Best regards,\n${FOUNDER}\nFounder & CEO (Sri Lanka Tours Driver)\n${LOCATION}\nVoice/WhatsApp: ${PHONE}\nEmail: info@srilankatoursdriver.com\nWeb: ${website}\nWhatsApp: ${WHATSAPP}${awardText ? `\n\n${awardText}` : ""}\nTripadvisor: Sri Lanka Tours Driver\n${profile}${socialLinks.length ? `\n\nFollow us:\n${socialLinks.map(({ label, url }) => `${label}: ${url}`).join("\n")}` : ""}`,
  };
}
