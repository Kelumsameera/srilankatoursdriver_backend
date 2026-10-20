import type { Request, Response } from "express";
import * as uiMessages from "../services/ui-messages.service.js";
import { logActivity } from "../services/activity.service.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
import { ok } from "../utils/response.js";

type Params = { locale: string };

/** GET /ui-messages/:locale (public and admin): the overrides for one language. */
export async function list(req: Request, res: Response) {
  const { locale } = req.validated?.params as Params;
  return ok(res, await uiMessages.listUiMessages(locale));
}

/** PUT /admin/ui-messages/:locale: save changed overrides and refresh the website. */
export async function update(req: Request, res: Response) {
  const { locale } = req.validated?.params as Params;
  const { messages } = req.validated?.body as { messages: Record<string, string> };
  const result = await uiMessages.updateUiMessages(locale, messages, req.user?.id);
  await logActivity(req, { action: "settings_update", entity: "uiMessage", summary: `Updated ${Object.keys(messages).length} UI text(s) for ${locale}` });
  revalidateFrontend(CACHE_TAGS.translations);
  return ok(res, result, "UI texts saved");
}
