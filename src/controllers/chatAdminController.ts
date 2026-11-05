import type { NextFunction, Request, Response } from "express";
import { ChatConversation, ChatUsage } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";
import { ApiError } from "../utils/ApiError.js";
import { noContent, ok } from "../utils/response.js";

/*
 * Admin → AI Chats: the conversation inbox, lead status and Gemini usage.
 * Permissions are checked in routes/admin/index.ts (the "bookings" and "analytics" permissions).
 */

// Rough Gemini Flash list prices in USD per 1M tokens, only for the cost estimate on the usage screen
const USD_PER_M_INPUT = 0.3;
const USD_PER_M_OUTPUT = 2.5;

// GET /api/admin/chats - newest chats first, filter by lead status or "wants a person"
export async function listChats(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.validated?.query as { page: number; limit: number; leadStatus?: string; handoff?: string };
    const filter: Record<string, unknown> = {};
    if (q.leadStatus) filter.leadStatus = q.leadStatus;
    if (q.handoff) filter["handoff.requested"] = true;
    const [rows, total] = await Promise.all([
      ChatConversation.find(filter)
        .select("locale leadStatus handoff contact booking createdAt updatedAt messages")
        .sort({ updatedAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      ChatConversation.countDocuments(filter),
    ]);
    // The list only needs the first question, not the whole chat
    const items = rows.map(({ messages, ...chat }) => ({
      ...chat,
      messageCount: messages.length,
      firstMessage: messages.find((m) => m.role === "user")?.text.slice(0, 160) ?? "",
    }));
    ok(res, items, "OK", 200, { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/chats/:id - one whole chat
export async function getChatForAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await ChatConversation.findById(req.params.id).lean();
    if (!chat) throw ApiError.notFound("Chat not found");
    ok(res, chat);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/chats/:id - lead status and staff note
export async function updateChat(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = req.validated?.body as { leadStatus?: string; staffNote?: string };
    const chat = await ChatConversation.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true }).lean();
    if (!chat) throw ApiError.notFound("Chat not found");
    void logActivity(req, { action: "update", entity: "chatConversation", entityId: String(chat._id), summary: `Updated AI chat lead (${chat.leadStatus})` });
    ok(res, chat, "Updated");
  } catch (error) {
    next(error);
  }
}

// DELETE /api/admin/chats/:id - delete one chat (e.g. on a visitor's data-deletion request)
export async function deleteChatForAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await ChatConversation.findByIdAndDelete(req.params.id).lean();
    if (!chat) throw ApiError.notFound("Chat not found");
    void logActivity(req, { action: "delete", entity: "chatConversation", entityId: String(chat._id), summary: "Deleted an AI chat" });
    noContent(res);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/chats/usage?days=30 - Gemini requests, tokens and estimated cost per day
export async function chatUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const { days } = req.validated?.query as { days: number };
    const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await ChatUsage.find({ day: { $gte: since } }).select("day requests inputTokens outputTokens").sort({ day: 1 }).lean();
    const totals = rows.reduce(
      (t, r) => ({ requests: t.requests + r.requests, inputTokens: t.inputTokens + r.inputTokens, outputTokens: t.outputTokens + r.outputTokens }),
      { requests: 0, inputTokens: 0, outputTokens: 0 },
    );
    const estimatedUsd = Math.round(((totals.inputTokens * USD_PER_M_INPUT + totals.outputTokens * USD_PER_M_OUTPUT) / 1_000_000) * 100) / 100;
    const [chats, handoffs, converted] = await Promise.all([
      ChatConversation.countDocuments({ createdAt: { $gte: new Date(since) } }),
      ChatConversation.countDocuments({ createdAt: { $gte: new Date(since) }, "handoff.requested": true }),
      ChatConversation.countDocuments({ createdAt: { $gte: new Date(since) }, leadStatus: "converted" }),
    ]);
    ok(res, { days: rows, totals: { ...totals, estimatedUsd }, chats, handoffs, converted });
  } catch (error) {
    next(error);
  }
}
