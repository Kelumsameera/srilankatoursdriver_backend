import { z } from "zod";
import { Router } from "express";
import * as c from "../controllers/customer-auth.controller.js";
import { customerAuthLimiter, formLimiter, guestUploadLimiter } from "../middleware/security.js";
import { cleanupTempFiles, mediaUpload } from "../middleware/upload.js";
import { addComment, getEngagement, toggleLike } from "../controllers/engagementController.js";
import { myStories, submitStory, uploadStoryMedia } from "../controllers/storyController.js";
import { validate } from "../middleware/validate.js";
import { customerRegisterSchema, googleLoginSchema, loginSchema } from "../validations/auth.js";
import { commentSubmit, storySubmit } from "../validations/content.js";

// :type is "blog" (then :key is the post slug) or "story" (then :key is the story id)
const engagementParam = z.object({ type: z.enum(["blog", "story"]), key: z.string().trim().min(1).max(160) });

/** Optional website-visitor accounts (email/password or Google). Completely separate from the admin `/auth` routes. */
export const customerRouter = Router();

customerRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

customerRouter.post("/auth/register", customerAuthLimiter, validate({ body: customerRegisterSchema }), c.register);
customerRouter.post("/auth/login", customerAuthLimiter, validate({ body: loginSchema }), c.login);
customerRouter.post("/auth/google", customerAuthLimiter, validate({ body: googleLoginSchema }), c.google);
customerRouter.post("/auth/refresh", customerAuthLimiter, c.refresh);
customerRouter.post("/auth/logout", c.logout);
customerRouter.get("/auth/me", c.authenticateCustomer, c.me);
customerRouter.get("/bookings", c.authenticateCustomer, c.bookings);

// LIKES AND COMMENTS on blog posts (/engagement/blog/:slug) and guest stories (/engagement/story/:id).
// They live here (not under /blog) because the customer's session cookie is only sent to /api/customer.
// Anyone can read them; only signed-in customers can like or comment (comments wait for approval).
const engagementParams = validate({ params: engagementParam });
customerRouter.get("/engagement/:type/:key", engagementParams, c.identifyCustomer, getEngagement);
customerRouter.post("/engagement/:type/:key/like", engagementParams, c.authenticateCustomer, toggleLike);
customerRouter.post("/engagement/:type/:key/comments", formLimiter, validate({ params: engagementParam, body: commentSubmit }), c.authenticateCustomer, addComment);

// GUEST STORIES: upload photos/videos one by one, then send the story (it waits for approval)
customerRouter.get("/stories", c.authenticateCustomer, myStories);
customerRouter.post("/stories/upload", guestUploadLimiter, c.authenticateCustomer, cleanupTempFiles, mediaUpload.single("file"), uploadStoryMedia);
customerRouter.post("/stories", formLimiter, c.authenticateCustomer, validate({ body: storySubmit }), submitStory);
