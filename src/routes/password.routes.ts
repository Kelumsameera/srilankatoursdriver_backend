import { Router } from "express";
import * as c from "../controllers/password-reset.controller.js";
import { passwordResetLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { forgotPasswordSchema, resetPasswordSchema } from "../validations/auth.js";

/** "Forgot password" for both team and customer accounts. */
export const passwordRouter = Router();

passwordRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

passwordRouter.post("/forgot", passwordResetLimiter, validate({ body: forgotPasswordSchema }), c.forgot);
passwordRouter.post("/reset", passwordResetLimiter, validate({ body: resetPasswordSchema }), c.resetPassword);
