import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { createRateLimiter, formLimiter } from "../middleware/security.js";
import { isTest } from "../config/env.js";
import { chatMessageCreate, chatSessionCreate } from "../validations/chat.js";
import {
  confirmBooking,
  deleteChat,
  getChat,
  getChatStatus,
  requireChatEnabled,
  requireChatHeader,
  sendMessage,
  startChat,
} from "../controllers/chatController.js";

// Per-IP limits: each message costs a Gemini call, so keep them tight
const messageLimiter = createRateLimiter(10 * 60 * 1000, isTest ? 10_000 : 20);
const sessionLimiter = createRateLimiter(60 * 60 * 1000, isTest ? 10_000 : 10);

// AI travel assistant, mounted at /api/chat
export const chatRouter = Router();

chatRouter.get("/status", getChatStatus);
chatRouter.use(requireChatEnabled, requireChatHeader);
chatRouter.post("/session", sessionLimiter, validate({ body: chatSessionCreate }), startChat);
chatRouter.get("/session", getChat);
chatRouter.delete("/session", deleteChat);
chatRouter.post("/messages", messageLimiter, validate({ body: chatMessageCreate }), sendMessage);
// Same hourly limit as the website's booking form
chatRouter.post("/booking/confirm", formLimiter, confirmBooking);
