import type { Request } from "express";
import { ActivityLog, type ActivityAction } from "../models/ActivityLog.js";
import { logger } from "../config/logger.js";

interface LogInput {
  action: ActivityAction;
  entity?: string;
  entityId?: string;
  summary?: string;
  userId?: string;
  userEmail?: string;
}

/**
 * Defence in depth: audit summaries are built from server-side strings, but they can include
 * titles or emails typed by users. Anything that looks like a credential is masked.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[redacted-token]")
    .replace(/\b(bearer)\s+[\w.~+/-]{16,}=*/gi, "$1 [redacted]")
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1$2[redacted]");
}

/** Records an audit entry. Never throws – auditing must not break the request. */
export async function logActivity(req: Request | null, input: LogInput): Promise<void> {
  try {
    await ActivityLog.create({
      user: input.userId ?? req?.user?.id,
      userEmail: input.userEmail ?? req?.user?.email ?? "",
      action: input.action,
      entity: input.entity ?? "",
      entityId: input.entityId ?? "",
      summary: redactSecrets(input.summary ?? "").slice(0, 500),
      ip: req?.ip ?? "",
      userAgent: (req?.headers["user-agent"] ?? "").slice(0, 300),
      timestamp: new Date(),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write activity log");
  }
}
