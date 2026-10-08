import { Router } from "express";
import * as c from "../controllers/customer-auth.controller.js";
import { customerAuthLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { customerRegisterSchema, googleLoginSchema, loginSchema } from "../validations/auth.js";

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
