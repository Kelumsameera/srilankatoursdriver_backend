import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { publicQuery, slugParam } from "../validations/public.js";
import { getDestinationBySlug, getDestinations, getNearbyDestinations } from "../controllers/destinationController.js";

// validate() checks the query string (?locale=de&limit=6) and the :slug before the controller runs
const checkQuery = validate({ query: publicQuery });
const checkQueryAndSlug = validate({ query: publicQuery, params: slugParam });

// Public website routes, mounted at /api/destinations (admin editing stays on the shared crudRouter)
export const destinationRouter = Router();

destinationRouter.get("/", checkQuery, getDestinations);
destinationRouter.get("/:slug", checkQueryAndSlug, getDestinationBySlug);
destinationRouter.get("/:slug/nearby", checkQueryAndSlug, getNearbyDestinations);
