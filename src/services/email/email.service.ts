import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { SiteSetting } from "../../models/SiteSetting.js";
import { escapeHtml } from "../../utils/helpers.js";

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

function getTransporter(): Transporter | null {
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

/** Internal notification + guest acknowledgement for a new submission. */
export async function notifyNewSubmission(kind: string, reference: string, guestEmail: string, guestName: string, rows: [string, unknown][]) {
  if (!isEmailConfigured()) return;
  const [to, name] = await Promise.all([notifyAddress(), businessName()]);
  const body = table([["Reference", reference], ...rows]);
  if (to) {
    await sendMail({
      to,
      replyTo: guestEmail,
      subject: `New ${kind} ${reference} – ${guestName}`,
      html: `<h2 style="font-family:Arial">New ${escapeHtml(kind)}</h2>${body.html}`,
      text: `New ${kind}\n\n${body.text}`,
    });
  }
  await sendMail({
    to: guestEmail,
    subject: `We received your ${kind} (${reference})`,
    html: `<p style="font-family:Arial">Dear ${escapeHtml(guestName)},</p><p style="font-family:Arial">Thank you for contacting ${escapeHtml(
      name,
    )}. We have received your ${escapeHtml(kind)} and will reply shortly.</p>${body.html}<p style="font-family:Arial">— ${escapeHtml(name)}</p>`,
    text: `Dear ${guestName},\n\nThank you for contacting ${name}. We have received your ${kind} and will reply shortly.\n\n${body.text}\n\n— ${name}`,
  });
}
