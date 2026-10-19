import { Router } from "express";
import { getStories, getStory } from "../controllers/storyController.js";

// Public website routes for guest travel stories, mounted at /api/stories (only published stories)
export const storyRouter = Router();

storyRouter.get("/", getStories);
storyRouter.get("/:id", getStory);
