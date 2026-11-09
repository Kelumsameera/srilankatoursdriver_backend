import { escapeHtml } from "../../utils/helpers.js";

const WEBSITE = "https://srilankatoursdriver.com";
const LOGO = "https://srilankatoursdriver.vercel.app/images/branding/sri-lanka-emblem-512.png";

function publicHttps(value: string | undefined, fallback: string): string {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

/** Inline styles and a table keep the signature readable in common email clients. */
export function buildEmailSignature(name: string, logoUrl?: string, websiteUrl?: string) {
  const website = publicHttps(websiteUrl, WEBSITE);
  const logo = publicHttps(logoUrl, LOGO);
  return {
    html: `<div style="margin-top:28px;font-family:Arial,sans-serif;font-size:14px;color:#334155"><p style="margin:0 0 12px">Best regards,</p><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:14px;vertical-align:top"><a href="${escapeHtml(website)}"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)} logo" width="64" style="display:block;width:64px;height:auto;border:0"></a></td><td style="vertical-align:top"><strong style="font-size:16px;color:#032d55">${escapeHtml(name)}</strong><br><a href="mailto:info@srilankatoursdriver.com" style="color:#009f91;text-decoration:none">info@srilankatoursdriver.com</a><br><a href="${escapeHtml(website)}" style="color:#009f91;text-decoration:none">${escapeHtml(new URL(website).hostname)}</a></td></tr></table></div>`,
    text: `Best regards,\n${name}\ninfo@srilankatoursdriver.com\n${website}`,
  };
}
