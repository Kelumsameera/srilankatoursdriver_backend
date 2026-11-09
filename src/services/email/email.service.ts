import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { BrandSetting } from "../../models/BrandSetting.js";
import { buildEmailSignature } from "./email-signature.js";
import { SiteSetting } from "../../models/SiteSetting.js";
import { escapeHtml } from "../../utils/helpers.js";

let transporter: Transporter | null = null;

/** Minimal transport shape, so tests can capture mail without an SMTP server. */
export interface MailTransport {
  sendMail(mail: Mail & { from: string }): Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
  verify(): Promise<unknown>;
}
let override: MailTransport | null = null;
/** Test hook – lets tests capture outgoing mail. */
export function setMailTransport(t: MailTransport | null) {
  override = t;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

function getTransporter(): MailTransport | null {
  if (override) return override;
  if (!isEmailConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Log only safe metadata: SMTP errors can contain credentials or message content. */
function logSmtpError(error: unknown, operation: string) {
  const e = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof e?.code === "string" && /^[A-Z_]+$/.test(e.code) ? e.code : "UNKNOWN";
  const responseCode = typeof e?.responseCode === "number" ? e.responseCode : undefined;
  logger.error({ code, responseCode, operation }, code === "EAUTH" || responseCode === 535
    ? "Titan authentication failed: check the official mailbox password, third-party access and app password if 2FA is enabled"
    : "Titan SMTP operation failed");
}

/** Verifies TLS connectivity and authentication; does not send a message. */
export async function verifyEmailConnection(): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.warn("Titan SMTP is disabled: SMTP_PASSWORD is missing");
    return false;
  }
  try {
    await t.verify();
    return true;
  } catch (error) {
    logSmtpError(error, "verify");
    return false;
  }
}

/** True only if SMTP accepted every intended recipient. Never retry ambiguous/partial sends. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const recipients = [...new Set((Array.isArray(mail.to) ? mail.to : [mail.to]).map((a) => a.trim().toLowerCase()))];
  if (!recipients.length || recipients.some((a) => !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(a))) {
    logger.error("Email recipients are invalid");
    return false;
  }
  try {
    const result = await t.sendMail({ ...mail, to: recipients, from: env.SMTP_FROM });
    const accepted = new Set((result.accepted ?? []).map((a) => String(a).toLowerCase()));
    const complete = Array.isArray(result.accepted) && Array.isArray(result.rejected) && result.rejected.length === 0 && recipients.every((a) => accepted.has(a));
    if (!complete) logger.error({ acceptedCount: accepted.size, rejectedCount: result.rejected?.length, expectedCount: recipients.length }, "SMTP did not accept all recipients; no automatic retry");
    return complete;
  } catch (error) {
    logSmtpError(error, "send");
    return false;
  }
}

function table(rows: [string, unknown][]): { html: string; text: string } {
  const filtered = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  const fmt = (v: unknown) => (v instanceof Date ? v.toDateString() : Array.isArray(v) ? v.join(", ") : String(v));
  return {
    html: `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${filtered
      .map(
        ([k, v]) =>
          `<tr><td style="border-bottom:1px solid #eee;color:#555"><strong>${escapeHtml(k)}</strong></td><td style="border-bottom:1px solid #eee">${escapeHtml(
            fmt(v),
          )}</td></tr>`,
      )
      .join("")}</table>`,
    text: filtered.map(([k, v]) => `${k}: ${fmt(v)}`).join("\n"),
  };
}

// NOTIFY_EMAIL can hold several inboxes: "a@x.com, b@y.com" – every one gets each notification
async function notifyAddress(): Promise<string[] | null> {
  const list = (env.NOTIFY_EMAIL ?? "").split(/[,;\s]+/).filter(Boolean);
  if (list.length) return list;
  const s = await SiteSetting.findOne({ key: "default" }).select("email").lean();
  return s?.email ? [s.email] : null;
}

async function businessName(): Promise<string> {
  const s = await SiteSetting.findOne({ key: "default" }).select("businessName").lean();
  return s?.businessName || "Sri Lanka Tours Driver";
}

async function emailSignature(name: string) {
  try {
    const branding = await BrandSetting.findOne({ key: "default" }).select("logoIcon primaryLogo darkLogo").lean();
    return buildEmailSignature(name, (branding?.logoIcon?.url || branding?.primaryLogo?.url || branding?.darkLogo?.url) ?? undefined, env.FRONTEND_URL);
  } catch {
    // Branding lookup failure must not stop a booking notification or password reset.
    return buildEmailSignature(name, undefined, env.FRONTEND_URL);
  }
}

/** Header-safe single line (no CR/LF) of limited length. */
function headerText(value: string, max = 80): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

// Guest acknowledgements go to an address typed into a public form, so they are capped to stop the
// site being used to mail strangers. Counted in memory: the API runs as a single process.
export const ACK_LIMIT_PER_RECIPIENT = 3;
export const ACK_LIMIT_PER_DAY = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
let acksByRecipient = new Map<string, number[]>();
let acksToday: number[] = [];

/** Records an acknowledgement if both caps allow it; returns false when it must not be sent. */
function allowAcknowledgement(recipient: string): boolean {
  const now = Date.now();
  const since = now - DAY_MS;
  acksToday = acksToday.filter((t) => t > since);
  const key = recipient.trim().toLowerCase();
  const sent = (acksByRecipient.get(key) ?? []).filter((t) => t > since);
  if (sent.length >= ACK_LIMIT_PER_RECIPIENT || acksToday.length >= ACK_LIMIT_PER_DAY) return false;
  acksByRecipient.set(key, [...sent, now]);
  acksToday.push(now);
  if (acksByRecipient.size > 5000) {
    for (const [k, times] of acksByRecipient) if (times.every((t) => t <= since)) acksByRecipient.delete(k);
  }
  return true;
}

/** Test hook – clears the acknowledgement counters. */
export function resetAcknowledgementLimits() {
  acksByRecipient = new Map();
  acksToday = [];
}

/**
 * Internal notification (with every submitted detail) + a short guest acknowledgement.
 * The acknowledgement contains only the reference and fixed text – nothing the visitor typed –
 * so the site can't be used to deliver attacker-written content from our domain.
 */
// Match the booking submission deduplication window, including concurrent calls. No automatic
// retries: after a timeout SMTP may already have accepted the message. This is process-local.
const notifications = new Map<string, { startedAt: number; pending: Promise<void> }>();
export async function notifyNewSubmission(kind: string, reference: string, guestEmail: string, guestName: string, details: [string, unknown][]) {
  if (!getTransporter()) return;
  const now = Date.now();
  for (const [key, value] of notifications) if (now - value.startedAt > 15 * 60 * 1000) notifications.delete(key);
  const key = `${kind}:${reference}`;
  const previous = notifications.get(key);
  if (previous) return previous.pending;
  const pending = deliverSubmission(kind, reference, guestEmail, guestName, details).catch((error: unknown) => {
    logSmtpError(error, "notification");
  });
  notifications.set(key, { startedAt: now, pending });
  return pending;
}

async function deliverSubmission(kind: string, reference: string, guestEmail: string, guestName: string, details: [string, unknown][]) {
  if (!getTransporter()) return;
  const [to, name] = await Promise.all([notifyAddress(), businessName()]);
  const signature = await emailSignature(name);
  if (to) {
    const internal = table([["Reference", reference], ...details]);
    await sendMail({
      to,
      replyTo: guestEmail,
      subject: `New ${kind} ${reference} – ${headerText(guestName)}`,
      html: `<h2 style="font-family:Arial">New ${escapeHtml(kind)}</h2>${internal.html}${signature.html}`,
      text: `New ${kind}\n\n${internal.text}\n\n${signature.text}`,
    });
  }
  if (!allowAcknowledgement(guestEmail)) {
    logger.warn({ kind, reference }, "Guest acknowledgement not sent – rate limit reached");
    return;
  }
  await sendMail({
    to: guestEmail,
    subject: `We received your ${kind} (${reference})`,
    html: `<p style="font-family:Arial">Hello,</p><p style="font-family:Arial">Thank you for contacting ${escapeHtml(name)}. We have received your ${escapeHtml(
      kind,
    )} (reference <strong>${escapeHtml(reference)}</strong>) and will reply shortly.</p>${signature.html}`,
    text: `Hello,\n\nThank you for contacting ${name}. We have received your ${kind} (reference ${reference}) and will reply shortly.\n\n${signature.text}`,
  });
}

/** "Forgot password" email. The name is the account's own; the link is built by the server. */
export async function sendPasswordResetEmail(to: string, name: string, link: string, team: boolean) {
  if (!getTransporter()) return;
  const site = await businessName();
  const signature = await emailSignature(site);
  const intro = team ? `We received a request to reset the password of your ${site} team account.` : `We received a request to reset your ${site} account password.`;
  const outro = "This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email – your password stays the same.";
  await sendMail({
    to,
    subject: `Reset your ${headerText(site)} password`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px">
<p>Hello ${escapeHtml(name)},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f4d3a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">Reset password</a></p>
<p style="color:#555;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(link)}</p>
<p style="color:#555;font-size:13px">${escapeHtml(outro)}</p>
${signature.html}
</div>`,
    text: `Hello ${name},\n\n${intro}\n\nReset your password: ${link}\n\n${outro}\n\n${signature.text}`,
  });
}
