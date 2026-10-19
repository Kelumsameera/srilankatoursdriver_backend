import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { feedQuery, getFeed } from "../controllers/feedController.js";

// Public community feed (blog articles + guest stories), mounted at /api/feed
export const feedRouter = Router();

feedRouter.get("/", validate({ query: feedQuery }), getFeed);
