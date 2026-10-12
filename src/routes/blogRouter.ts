import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { publicQuery, slugParam } from "../validations/public.js";
import { getBlogPostBySlug, getBlogPosts } from "../controllers/blogController.js";

// validate() checks the query string (?locale=de&limit=6) and the :slug before the controller runs
const checkQuery = validate({ query: publicQuery });
const checkQueryAndSlug = validate({ query: publicQuery, params: slugParam });

// Public website routes, mounted at /api/blog (admin editing stays on the shared crudRouter)
export const blogRouter = Router();

blogRouter.get("/", checkQuery, getBlogPosts);
blogRouter.get("/:slug", checkQueryAndSlug, getBlogPostBySlug);
