import type { Request, Response } from "express";
import * as reset from "../services/password-reset.service.js";
import { ok } from "../utils/response.js";

export async function forgot(req: Request, res: Response) {
  const { email } = req.validated?.body as { email: string };
  await reset.requestPasswordReset(email);
  return ok(res, null, "If an account exists for this email, we've sent a reset link");
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.validated?.body as { token: string; password: string };
  const result = await reset.resetPassword(token, password);
  return ok(res, result, "Password updated");
}
