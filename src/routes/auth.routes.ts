import { Router } from "express";
import * as c from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { changePasswordSchema, loginSchema } from "../validations/auth.js";

export const authRouter = Router();

authRouter.post("/login", authLimiter, validate({ body: loginSchema }), c.login);
authRouter.post("/refresh", authLimiter, c.refresh);
authRouter.post("/logout", c.logout);
authRouter.get("/me", authenticate, c.me);
authRouter.post("/change-password", authLimiter, authenticate, validate({ body: changePasswordSchema }), c.changePassword);
