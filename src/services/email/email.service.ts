import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { SiteSetting } from "../../models/SiteSetting.js";
import { escapeHtml } from "../../utils/helpers.js";

let transporter: Transporter | null = null;

/** Minimal transport shape, so tests can capture mail without an SMTP server. */
export interface MailTransport {
  sendMail(mail: Mail & { from: string }): Promise<unknown>;
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
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Sends an email if SMTP is configured. Never throws – failures are logged. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({ from: env.SMTP_FROM, ...mail });
    return true;
  } catch (err) {
    logger.error({ err, to: mail.to }, "Email send failed");
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

async function notifyAddress(): Promise<string | null> {
  if (env.NOTIFY_EMAIL) return env.NOTIFY_EMAIL;
  const s = await SiteSetting.findOne({ key: "default" }).select("email").lean();
  return s?.email || null;
}

async function businessName(): Promise<string> {
  const s = await SiteSetting.findOne({ key: "default" }).select("businessName").lean();
  return s?.businessName || "Sri Lanka Tours Driver";
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
export async function notifyNewSubmission(kind: string, reference: string, guestEmail: string, guestName: string, details: [string, unknown][]) {
  if (!getTransporter()) return;
  const [to, name] = await Promise.all([notifyAddress(), businessName()]);
  if (to) {
    const internal = table([["Reference", reference], ...details]);
    await sendMail({
      to,
      replyTo: guestEmail,
      subject: `New ${kind} ${reference} – ${headerText(guestName)}`,
      html: `<h2 style="font-family:Arial">New ${escapeHtml(kind)}</h2>${internal.html}`,
      text: `New ${kind}\n\n${internal.text}`,
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
    )} (reference <strong>${escapeHtml(reference)}</strong>) and will reply shortly.</p><p style="font-family:Arial">— ${escapeHtml(name)}</p>`,
    text: `Hello,\n\nThank you for contacting ${name}. We have received your ${kind} (reference ${reference}) and will reply shortly.\n\n— ${name}`,
  });
}
