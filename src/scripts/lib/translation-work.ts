import { open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";

export async function writeCheckpoint(file: string, data: unknown) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2));
  await rename(temporary, file);
}

/** Coordinate maintenance processes without exceeding the provider request rate. */
export async function waitForRequestSlot(dir: string) {
  const lockPath = `${dir}/request.lock`;
  for (;;) {
    const lock = await open(lockPath, "wx").catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 30000) await unlink(lockPath).catch(() => undefined);
      return null;
    });
    if (!lock) { await new Promise((resolve) => setTimeout(resolve, 500)); continue; }
    try {
      const last = Number(await readFile(`${dir}/last-request`, "utf8").catch(() => "0"));
      const delay = Math.max(0, 7000 - (Date.now() - last));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await writeFile(`${dir}/last-request`, String(Date.now()));
      return;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
}

export function validateTranslation(source: string, text: unknown): asserts text is string {
  if (typeof text !== "string" || !text.trim() || /\uFFFD/.test(text)) throw new Error("Empty or damaged translation");
  const tokens = (value: string) => (value.match(/\{[^{}]+\}|https?:\/\/[^\s)"'<>]+/g) ?? []).sort().join("\n");
  if (tokens(source) !== tokens(text)) throw new Error("Translation changed a URL or placeholder");
}

/** Never associate translated text with its source by array position. */
export function readTranslationResult(texts: string[], result: unknown): string[] {
  if (!result || typeof result !== "object" || Array.isArray(result) || Object.keys(result).length !== texts.length) throw new Error("Translation IDs differ");
  return texts.map((source, id) => {
    const text = (result as Record<string, unknown>)[String(id)];
    validateTranslation(source, text);
    return text;
  });
}
