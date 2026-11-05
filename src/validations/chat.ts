import { z } from "zod";
import { SUPPORTED_LOCALES } from "../config/locales.js";
import { publishable } from "./common.js";

// POST /api/chat/session
export const chatSessionCreate = z.object({
  locale: z.enum(SUPPORTED_LOCALES).default("en"),
});

// POST /api/chat/messages
export const chatMessageCreate = z.object({
  text: z.string().trim().min(1).max(1000),
});

// Admin → Content → AI Knowledge
export const chatKnowledgeCreate = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(1).max(4000),
  ...publishable,
});
export const chatKnowledgeUpdate = chatKnowledgeCreate.partial();

// Admin → AI Chats: lead management
export const chatAdminUpdate = z.object({
  leadStatus: z.enum(["none", "new", "contacted", "converted", "closed"]).optional(),
  staffNote: z.string().trim().max(4000).optional(),
});

export const chatAdminList = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  leadStatus: z.enum(["none", "new", "contacted", "converted", "closed"]).optional(),
  handoff: z.enum(["true"]).optional(),
});

export const chatUsageQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
