import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { publicQuery, slugParam } from "../validations/public.js";
import { getExcursionBySlug, getExcursions } from "../controllers/excursionController.js";

// validate() checks the query string (?locale=de&limit=6) and the :slug before the controller runs
const checkQuery = validate({ query: publicQuery });
const checkQueryAndSlug = validate({ query: publicQuery, params: slugParam });

// Public website routes, mounted at /api/excursions (admin editing stays on the shared crudRouter)
export const excursionRouter = Router();

excursionRouter.get("/", checkQuery, getExcursions);
excursionRouter.get("/:slug", checkQueryAndSlug, getExcursionBySlug);
