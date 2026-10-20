import { Router } from "express";
import { z } from "zod";
import * as c from "../../controllers/public.controller.js";
import * as crm from "../../controllers/crm.controller.js";
import { identifyCustomer } from "../../controllers/customer-auth.controller.js";
import { validate } from "../../middleware/validate.js";
import { formLimiter, trackLimiter } from "../../middleware/security.js";
import * as analytics from "../../controllers/analytics.controller.js";
import * as uiMessages from "../../controllers/ui-messages.controller.js";
import { uiLocaleParams } from "../../validations/ui-messages.js";
import { trackBody } from "../../validations/analytics.js";
import { bookingCreate, contactCreate, tailorMadeCreate } from "../../validations/crm.js";
import { publicReviewSubmit } from "../../validations/content.js";
import { publicQuery, slugParam } from "../../validations/public.js";
import { destinationRouter } from "../destinationRouter.js";
import { tourRouter } from "../tourRouter.js";
import { excursionRouter } from "../excursionRouter.js";
import { vehicleRouter } from "../vehicleRouter.js";
import { blogRouter } from "../blogRouter.js";
import { storyRouter } from "../storyRouter.js";
import { feedRouter } from "../feedRouter.js";

const keyParam = z.object({ key: z.string().regex(/^[a-z0-9-]{1,60}$/i) });

const lq = validate({ query: publicQuery });
const sq = validate({ query: publicQuery, params: slugParam });

export const publicRouter = Router();

// Global content
publicRouter.get("/site-settings", lq, c.siteSettings);
publicRouter.get("/branding", c.branding);
publicRouter.get("/languages", c.languages);
publicRouter.get("/ui-messages/:locale", validate({ params: uiLocaleParams }), uiMessages.list);
publicRouter.get("/navigation", lq, c.navigation);
publicRouter.get("/hero", lq, c.hero);
publicRouter.get("/pages/:slug", sq, c.page);
publicRouter.get("/preview/pages/:slug", sq, c.previewPage);
publicRouter.get("/seo/:key", validate({ params: keyParam }), c.seo);
publicRouter.get("/sitemap-data", c.sitemap);
publicRouter.get("/categories", lq, c.categories);

// Collections
publicRouter.use("/tours", tourRouter);
publicRouter.use("/destinations", destinationRouter);
publicRouter.use("/excursions", excursionRouter);
publicRouter.use("/vehicles", vehicleRouter);
publicRouter.use("/blog", blogRouter);
publicRouter.use("/stories", storyRouter);
publicRouter.use("/feed", feedRouter);
publicRouter.get("/gallery", lq, c.list("gallery"));
publicRouter.get("/guest-shorts", lq, c.list("guestShorts"));
publicRouter.get("/reviews", lq, c.list("reviews"));
publicRouter.get("/reviews/tripadvisor", c.tripadvisor);
publicRouter.get("/faqs", lq, c.list("faqs"));

// Anonymous page-view analytics
publicRouter.post("/track", trackLimiter, validate({ body: trackBody }), analytics.track);

// Submissions (rate-limited + honeypot)
publicRouter.post("/bookings", formLimiter, identifyCustomer, validate({ body: bookingCreate }), crm.submitBooking);
publicRouter.post("/tailor-made-enquiries", formLimiter, validate({ body: tailorMadeCreate }), crm.submitTailorMade);
publicRouter.post("/contact", formLimiter, validate({ body: contactCreate }), crm.submitContact);
publicRouter.post("/reviews", formLimiter, validate({ body: publicReviewSubmit }), c.submitReview);
