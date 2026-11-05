import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ChatConversation, ChatUsage, Customer } from "../models/index.js";
import type { ChatConversationDocument } from "../models/ChatConversation.js";
import { baseCookie } from "../services/auth.service.js";
import { generateReply } from "../services/gemini.service.js";
import { createBooking } from "../services/crm.service.js";
import { bookingCreate } from "../validations/crm.js";
import { zodToFieldErrors } from "../utils/zod.js";
import { ApiError } from "../utils/ApiError.js";
import { created, noContent, ok } from "../utils/response.js";

/*
 * AI travel assistant chat (/api/chat). A visitor's chat is found only through their signed httpOnly cookie,
 * so nobody can read or write another visitor's chat.
 */

export const CHAT_COOKIE = "sltd_chat";
// "/api", not "/api/chat": the cookie must also reach POST /api/customer/chat/link, the only place where the
// customer's own login cookie (Path=/api/customer) is sent too. It stays httpOnly and signed.
const COOKIE_PATH = "/api";
// Cookies set before the path change; cleared so a browser does not keep two chat cookies
const OLD_COOKIE_PATH = "/api/chat";
// One chat can hold this many visitor messages; after that the visitor is asked to contact the team
export const MAX_USER_MESSAGES = 40;
// Only the last messages are sent to Gemini, which keeps each request cheap
const HISTORY_SENT = 12;

// ---- Cookie: "<random id>.<HMAC signature>" ----

function sign(id: string) {
  return createHmac("sha256", env.CHAT_SESSION_SECRET ?? "").update(id).digest("base64url");
}

function hashId(id: string) {
  return createHash("sha256").update(id).digest("hex");
}

// The session hash from a valid cookie, or null for a missing / forged cookie
function readSessionHash(req: Request): string | null {
  const value = req.cookies?.[CHAT_COOKIE];
  if (typeof value !== "string") return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return hashId(id);
}

function retentionDate() {
  return new Date(Date.now() + env.CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// The chat that belongs to this visitor's cookie, or a 404 error
async function findOwnChat(req: Request) {
  const sessionHash = readSessionHash(req);
  const chat = sessionHash ? await ChatConversation.findOne({ sessionHash, status: "open" }) : null;
  if (!chat) throw ApiError.notFound("Chat not found");
  return chat;
}

// The linked customer, only while their account is still active (a suspended account is treated as a guest)
async function activeCustomer(customerId: unknown) {
  if (!customerId) return null;
  return Customer.findOne({ _id: customerId, status: "active" }).select("name").lean();
}

// First name only: the least personal data that still lets the assistant greet the customer
export function firstNameOf(name: unknown) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

// The booking draft as the visitor sees it in the "check and confirm" card
function draftSummary(draft: ChatConversationDocument["bookingDraft"]) {
  if (!draft) return null;
  return {
    tourTitle: draft.tourTitle,
    startDate: draft.startDate,
    adults: draft.adults,
    children: draft.children ?? 0,
    name: draft.customer?.name,
    email: draft.customer?.email,
    phone: draft.customer?.phone ?? draft.customer?.whatsapp ?? "",
  };
}

// What the browser may see of a chat (no hashes, no token counts, no staff notes)
function publicChat(chat: ChatConversationDocument) {
  return {
    locale: chat.locale,
    messages: chat.messages.map((m) => ({ role: m.role, text: m.text, createdAt: m.createdAt })),
    bookingDraft: draftSummary(chat.bookingDraft),
    bookingReference: chat.booking?.reference ?? null,
    handoff: Boolean(chat.handoff?.requested),
  };
}

// ---- Middleware ----

// The chat is switched off until both GEMINI_API_KEY and CHAT_SESSION_SECRET are set
export function requireChatEnabled(_req: Request, _res: Response, next: NextFunction) {
  if (!env.GEMINI_API_KEY || !env.CHAT_SESSION_SECRET) return next(ApiError.unavailable("The travel assistant is not available"));
  next();
}

// CSRF: every chat change must come from our own pages (Origin checked globally) and carry this header,
// which a cross-site form cannot set
export function requireChatHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers["x-requested-with"] !== "sltd-chat") return next(ApiError.forbidden("Missing chat header"));
  next();
}

// ---- Handlers ----

// GET /api/chat/status - whether the widget should be shown
export function getChatStatus(_req: Request, res: Response) {
  ok(res, { enabled: Boolean(env.GEMINI_API_KEY && env.CHAT_SESSION_SECRET) });
}

// POST /api/chat/session - start a new chat and set its cookie
export async function startChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { locale } = req.validated?.body as { locale: string };
    const id = randomBytes(32).toString("base64url");
    const chat = await ChatConversation.create({ sessionHash: hashId(id), locale, expiresAt: retentionDate() });
    res.clearCookie(CHAT_COOKIE, { ...baseCookie(), path: OLD_COOKIE_PATH });
    res.cookie(CHAT_COOKIE, `${id}.${sign(id)}`, { ...baseCookie(), path: COOKIE_PATH, maxAge: env.CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000 });
    created(res, publicChat(chat));
  } catch (error) {
    next(error);
  }
}

// GET /api/chat/session - the visitor's own chat history
export async function getChat(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await findOwnChat(req);
    ok(res, publicChat(chat));
  } catch (error) {
    next(error);
  }
}

// POST /api/chat/messages - save the visitor's message, ask Gemini, save and return the answer
export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = req.validated?.body as { text: string };
    const chat = await findOwnChat(req);

    if (chat.messages.filter((m) => m.role === "user").length >= MAX_USER_MESSAGES) {
      throw new ApiError(429, "This chat is full. Please contact our team on WhatsApp.", [], "CHAT_LIMIT");
    }
    // Spending guard for the whole site
    const usage = await ChatUsage.findOne({ day: today() }).lean();
    if (usage && usage.inputTokens + usage.outputTokens >= env.CHAT_DAILY_TOKEN_LIMIT) {
      throw new ApiError(503, "The travel assistant is busy. Please contact our team on WhatsApp.", [], "CHAT_BUDGET");
    }

    chat.messages.push({ role: "user", text, createdAt: new Date() });
    const history = chat.messages.slice(-HISTORY_SENT).map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));

    let reply;
    try {
      const customer = await activeCustomer(chat.customerId);
      reply = await generateReply(history, chat.locale, { locale: chat.locale, chat }, customer ? firstNameOf(customer.name) : undefined);
    } catch (error) {
      // Gemini's own error text is logged, never sent to the visitor
      logger.error({ status: (error as { status?: number }).status ?? 0, err: (error as Error).message }, "Gemini request failed");
      throw ApiError.unavailable("The travel assistant could not answer. Please try again or contact us on WhatsApp.");
    }
    const answer = reply.text || "Sorry, I could not answer that. Please contact our team on WhatsApp.";

    chat.messages.push({ role: "assistant", text: answer.slice(0, 8000), createdAt: new Date() });
    chat.inputTokens += reply.inputTokens;
    chat.outputTokens += reply.outputTokens;
    chat.expiresAt = retentionDate();
    await chat.save();
    await ChatUsage.updateOne(
      { day: today() },
      { $inc: { requests: 1, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens } },
      { upsert: true },
    );

    ok(res, { role: "assistant", text: answer, bookingDraft: draftSummary(chat.bookingDraft), handoff: Boolean(chat.handoff?.requested) });
  } catch (error) {
    next(error);
  }
}

// POST /api/chat/booking/confirm - the visitor pressed Confirm: the draft goes through the website's own
// booking code (same checks, duplicate guard, price list and email as the booking form). The AI never calls this.
export async function confirmBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await findOwnChat(req);
    if (!chat.bookingDraft) throw ApiError.badRequest("There is no booking to confirm");
    // Checked again: the date may have passed, or the tour may be unpublished, since the draft was made
    const parsed = bookingCreate.safeParse(chat.bookingDraft);
    if (!parsed.success) throw ApiError.badRequest("Please check the booking details again", zodToFieldErrors(parsed.error));

    // Linked chats: the booking appears under the customer's "My bookings". createBooking takes the account as its
    // own argument (the payload is validated form data, where an account id is not allowed).
    const customer = await activeCustomer(chat.customerId);
    const result = await createBooking({ ...parsed.data, source: "ai-chat" }, customer ? String(customer._id) : undefined);
    chat.booking = { reference: result.reference, id: result.id };
    chat.bookingDraft = null;
    chat.leadStatus = "converted";
    chat.messages.push({ role: "assistant", text: `Thank you! Your booking request ${result.reference} has been sent. Our team will contact you to confirm it.`, createdAt: new Date() });
    chat.markModified("bookingDraft");
    await chat.save();
    created(res, { reference: result.reference }, "Booking request received");
  } catch (error) {
    next(error);
  }
}

// DELETE /api/chat/session - the visitor deletes their chat (data deletion) and the cookie
export async function deleteChat(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionHash = readSessionHash(req);
    if (sessionHash) await ChatConversation.deleteOne({ sessionHash });
    res.clearCookie(CHAT_COOKIE, { ...baseCookie(), path: COOKIE_PATH });
    res.clearCookie(CHAT_COOKIE, { ...baseCookie(), path: OLD_COOKIE_PATH });
    noContent(res);
  } catch (error) {
    next(error);
  }
}

// POST /api/customer/chat/link - a signed-in customer links their current (guest) chat to their account.
// Both cookies must be valid: the chat cookie proves the chat is theirs, the login cookie proves who they are
// (authenticateCustomer runs first). A chat already linked to another account is never taken over.
export async function linkChatToCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await findOwnChat(req);
    const customer = await activeCustomer(req.customer?.id);
    if (!customer) throw ApiError.unauthorized();
    if (chat.customerId && String(chat.customerId) !== String(customer._id)) {
      throw ApiError.conflict("This chat belongs to another account");
    }
    if (!chat.customerId) {
      chat.customerId = customer._id;
      await chat.save();
    }
    ok(res, { linked: true });
  } catch (error) {
    next(error);
  }
}
