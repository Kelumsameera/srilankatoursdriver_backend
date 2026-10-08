import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Writes pretty JSON with a trailing newline; skips the write when content is unchanged (idempotent re-runs). */
export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const content = `${JSON.stringify(data, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
  fs.writeFileSync(file, content, "utf8");
}

export function writeText(file: string, content: string): void {
  ensureDir(path.dirname(file));
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
  fs.writeFileSync(file, content, "utf8");
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Path relative to a root, with forward slashes (stable across OSes). */
export function relPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
