import type { Request } from "express";
import { isLocale } from "../config/locales.js";
import type { PublicQuery } from "../validations/public.js";

// The query string after the validate() middleware has checked it
export function readQuery(req: Request) {
  return (req.validated?.query ?? {}) as PublicQuery;
}

// ?locale=de -> "de". Unknown locales mean "use the original English text"
export function readLocale(req: Request) {
  const locale = readQuery(req).locale;
  return isLocale(locale) ? locale : undefined;
}
