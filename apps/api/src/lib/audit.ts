import type { Request } from "express";
import cron from "node-cron";
import { prisma } from "./prisma.js";

// Structured security-event logging for a security product. Emits one JSON line per event to
// stdout — Docker captures it, and any log aggregator (Loki, CloudWatch, etc.) can parse it later
// without us running a logging service now.
// ponytail: JSON-to-stdout, not pino — a log shipper can parse these lines; add pino only if we
// outgrow stdout.
//
// NEVER pass secrets here: no passwords, TOTP codes/secrets, session IDs, or recovery codes. Log
// the email (an identifier, already in the DB) and the client IP, never the credential itself.

export type AuditEvent =
  | "login.success"
  | "login.failure"
  | "login.mfa_failure"
  | "login.lockout"
  | "logout"
  | "user.unlock"
  | "rate_limit.exceeded"
  | "user.create"
  | "user.delete"
  | "user.role_change"
  | "user.password_reset"
  | "user.mfa_reset"
  | "user.mfa_exempt_change"
  | "mfa.enabled"
  | "mfa.disabled"
  | "qualys.sync"
  | "qualys.sync_error"
  | "qualys.schedule_change"
  | "qualys.kb_fetch"
  | "qualys.kb_error"
  | "qualys.kb_edit"
  | "client.goals_change"
  | "demo.fake_sync";

/** Best-effort client IP, honoring the trust-proxy setting already configured on the app. */
export function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

export function audit(event: AuditEvent, fields: Record<string, unknown> = {}): void {
  // console.log so it lands on stdout (info), not stderr — these are normal operational events.
  console.log(JSON.stringify({ audit: event, ts: new Date().toISOString(), ...fields }));
  // Also persist to the AuthEvent table so admins can read the trail from the UI (the
  // "show me your access logs" compliance artifact). Fire-and-forget: a DB hiccup must never fail the
  // request that's being audited — stdout above is the fallback record.
  const { userId, email, ip, ...rest } = fields;
  void prisma.authEvent
    .create({
      data: {
        event,
        userId: typeof userId === "string" ? userId : null,
        email: typeof email === "string" ? email : null,
        ip: typeof ip === "string" ? ip : null,
        detail: Object.keys(rest).length ? JSON.stringify(rest) : null,
      },
    })
    .catch((err) => console.error("audit persist failed:", err));
}

// Keep a year of history — enough for an annual audit cycle without unbounded table growth.
const AUDIT_RETENTION_DAYS = 365;

/** Nightly prune of audit rows past retention. Call once at boot (see index.ts). */
export function initAuditPrune(): void {
  cron.schedule("30 4 * * *", async () => {
    const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000);
    const { count } = await prisma.authEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
    if (count) console.log(JSON.stringify({ audit: "audit.pruned", ts: new Date().toISOString(), count }));
  });
}
