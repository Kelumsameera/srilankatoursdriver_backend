import { Router } from "express";
import { z } from "zod";
import * as c from "../../controllers/public.controller.js";
import * as crm from "../../controllers/crm.controller.js";
import { validate } from "../../middleware/validate.js";
import { formLimiter } from "../../middleware/security.js";
import { bookingCreate, contactCreate, tailorMadeCreate } from "../../validations/crm.js";
import { publicReviewSubmit } from "../../validations/content.js";
import { CATEGORY_KINDS } from "../../models/Category.js";

const publicQuery = z.object({
  locale: z.string().max(5).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  featured: z.enum(["true", "false"]).optional(),
  category: z.string().trim().max(120).optional(),
  destination: z
    .string()
    .regex(/^[a-f0-9]{24}$/i)
    .optional(),
  search: z.string().trim().max(120).optional(),
  platform: z.enum(["youtube", "instagram", "tiktok", "upload", "website", "tripadvisor", "google", "facebook", "other"]).optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  token: z.string().max(2000).optional(),
});
const slugParam = z.object({ slug: z.string().trim().min(1).max(160) });
const keyParam = z.object({ key: z.string().regex(/^[a-z0-9-]{1,60}$/i) });

const lq = validate({ query: publicQuery });
const sq = validate({ query: publicQuery, params: slugParam });

export const publicRouter = Router();

// Global content
publicRouter.get("/site-settings", lq, c.siteSettings);
publicRouter.get("/branding", c.branding);
publicRouter.get("/languages", c.languages);
publicRouter.get("/navigation", lq, c.navigation);
publicRouter.get("/hero", lq, c.hero);
publicRouter.get("/pages/:slug", sq, c.page);
publicRouter.get("/preview/pages/:slug", sq, c.previewPage);
publicRouter.get("/seo/:key", validate({ params: keyParam }), c.seo);
publicRouter.get("/sitemap-data", c.sitemap);
publicRouter.get("/categories", lq, c.categories);

// Collections
publicRouter.get("/tours", lq, c.list("tours"));
publicRouter.get("/tours/:slug", sq, c.detail("tours"));
publicRouter.get("/destinations", lq, c.list("destinations"));
publicRouter.get("/destinations/:slug", sq, c.detail("destinations"));
publicRouter.get("/excursions", lq, c.list("excursions"));
publicRouter.get("/excursions/:slug", sq, c.detail("excursions"));
publicRouter.get("/vehicles", lq, c.list("vehicles"));
publicRouter.get("/vehicles/:slug", sq, c.detail("vehicles"));
publicRouter.get("/blog", lq, c.list("blog"));
publicRouter.get("/blog/:slug", sq, c.detail("blog"));
publicRouter.get("/gallery", lq, c.list("gallery"));
publicRouter.get("/guest-shorts", lq, c.list("guestShorts"));
publicRouter.get("/reviews", lq, c.list("reviews"));
publicRouter.get("/reviews/tripadvisor", c.tripadvisor);
publicRouter.get("/faqs", lq, c.list("faqs"));

// Submissions (rate-limited + honeypot)
publicRouter.post("/bookings", formLimiter, validate({ body: bookingCreate }), crm.submitBooking);
publicRouter.post("/tailor-made-enquiries", formLimiter, validate({ body: tailorMadeCreate }), crm.submitTailorMade);
publicRouter.post("/contact", formLimiter, validate({ body: contactCreate }), crm.submitContact);
publicRouter.post("/reviews", formLimiter, validate({ body: publicReviewSubmit }), c.submitReview);
