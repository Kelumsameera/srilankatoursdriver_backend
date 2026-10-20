import { z } from "zod";
import { mediaAsset, shortText } from "./common.js";

/**
 * Site Appearance ("theme") settings stored in BrandSetting.theme.
 * Defaults and presets live in the frontend (src/lib/theme.ts): anything not saved here falls back to them,
 * so an empty or old document keeps today's green/gold look.
 */

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #0f3d2e");

/** The 11 colour tokens of one palette (light or dark). */
const palette = z
  .object({
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
    background: hexColor,
    surface: hexColor,
    text: hexColor,
    muted: hexColor,
    border: hexColor,
    success: hexColor,
    warning: hexColor,
    error: hexColor,
  })
  .partial();

/** A Google Fonts family name: letters, digits and spaces only, so it is safe inside CSS and a URL. */
const fontName = z
  .string()
  .trim()
  .max(60)
  .regex(/^[A-Za-z0-9 ]*$/, "Font names may only contain letters, digits and spaces");

/** Only https images; quotes, brackets and backslashes are refused so the URL is safe inside CSS url(""). */
const cssImageUrl = z
  .string()
  .trim()
  .max(1000)
  .regex(/^(https:\/\/[^\s"'()\\<>]+)?$/, "Use an https image URL");

const headingSizes = z
  .object({
    h1: z.number().min(16).max(120),
    h2: z.number().min(14).max(96),
    h3: z.number().min(12).max(72),
    h4: z.number().min(12).max(60),
    h5: z.number().min(10).max(48),
    h6: z.number().min(10).max(40),
  })
  .partial();

/**
 * Removes the CSS that could break out of the <style> tag or load/run something:
 * "<" (no </style> or <script>), @import, expression(), javascript:/vbscript:, behavior:, -moz-binding
 * and url() pointing anywhere but https or an inline image.
 */
export function sanitizeCustomCss(input: string): string {
  return input
    .replace(/</g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/(java|vb)script\s*:/gi, "")
    .replace(/behavior\s*:/gi, "")
    .replace(/-moz-binding/gi, "")
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _q: string, url: string) => (/^(https:\/\/|data:image\/(png|jpeg|gif|webp);)/i.test(url.trim()) ? match : "none"))
    .trim();
}

export const themeSettings = z
  .object({
    preset: shortText(60),
    mode: z.enum(["light", "dark", "visitor"]),
    colors: palette,
    darkColors: palette,
    customThemes: z.array(z.object({ name: shortText(60).min(1), colors: palette, darkColors: palette })).max(20),
    typography: z
      .object({
        headingFont: fontName,
        bodyFont: fontName,
        sinhalaFont: fontName,
        tamilFont: fontName,
        baseSize: z.number().min(12).max(22),
        lineHeight: z.number().min(1).max(2.4),
        headingWeight: z.number().int().min(100).max(900),
        bodyWeight: z.number().int().min(100).max(900),
        headingSizes,
        responsive: z.boolean(),
      })
      .partial(),
    background: z
      .object({
        type: z.enum(["default", "solid", "gradient", "image"]),
        color: hexColor,
        gradient: z.object({ direction: z.number().int().min(0).max(360), stops: z.array(hexColor).min(2).max(3) }).partial(),
        image: z
          .object({
            asset: mediaAsset.nullable(),
            url: cssImageUrl,
            position: z.enum(["center", "top", "bottom", "left", "right"]),
            size: z.enum(["cover", "contain", "auto"]),
            repeat: z.boolean(),
            fixed: z.boolean(),
            overlayColor: hexColor,
            overlayOpacity: z.number().min(0).max(1),
          })
          .partial(),
      })
      .partial(),
    radiusScale: z.number().min(0).max(2),
    buttonStyle: z.enum(["pill", "rounded", "square"]),
    spacingScale: z.number().min(0.75).max(1.5),
    customCss: z.string().max(20_000).transform(sanitizeCustomCss),
  })
  .partial();

export type ThemeSettingsInput = z.infer<typeof themeSettings>;
