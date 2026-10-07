import { Router } from "express";
import mongoose from "mongoose";
import { authRouter } from "./auth.routes.js";
import { publicRouter } from "./public/index.js";
import { adminRouter } from "./admin/index.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ success: db, message: db ? "OK" : "Database unavailable", data: { uptime: process.uptime() } });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/", publicRouter);
