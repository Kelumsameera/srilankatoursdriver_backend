import { z } from "zod";
import { SUPPORTED_LOCALES } from "../config/locales.js";

/** A message key such as "nav.tours" or "home.hero.title". */
export const uiMessageKey = z.string().regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,6}$/, "Invalid message key").max(160);

export const uiLocaleParams = z.object({ locale: z.enum(SUPPORTED_LOCALES) });

/** Changed keys only: a text saves an override, an empty text removes it (back to the bundled text). */
export const uiMessagesUpdate = z.object({
  messages: z
    .record(uiMessageKey, z.string().max(2000))
    .refine((m) => Object.keys(m).length <= 1000, "Save at most 1000 messages at once"),
});
