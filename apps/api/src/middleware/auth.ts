import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { SESSION_ABSOLUTE_MS } from "../lib/session.js";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaExempt: boolean;
  mfaGraceMinutes: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// Mandatory MFA: an authenticated user without MFA may only reach the endpoints needed to
// finish enrolling (and to satisfy a forced password change first). Everything else 403s with a
// machine-readable code the frontend routes to the enrollment gate. /api/auth/logout isn't
// listed because it doesn't use requireAuth.
const ENROLLMENT_ALLOWED_PATHS = new Set([
  "/api/auth/me",
  "/api/auth/password",
  "/api/auth/mfa/setup",
  "/api/auth/mfa/enable",
  "/api/auth/mfa/status",
]);

/** Loads the session's user onto req.user, or 401s. Mount before any protected route. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  // Absolute session lifetime: past the cap, activity doesn't matter — re-authenticate. A
  // missing loginAt is a session from before this feature existed; expire those too (one forced
  // re-login at rollout). Mirrors the logout handler's destroy + clearCookie.
  const loginAt = req.session.loginAt;
  if (!loginAt || Date.now() - loginAt > SESSION_ABSOLUTE_MS) {
    req.session.destroy(() => {
      res.clearCookie("watchtower.sid");
      res.status(401).json({ error: "Your session expired — please sign in again." });
    });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    req.session.userId = undefined;
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  // MFA is mandatory — block the app (not just the UI) until enrolled. `mfaExempt` is the
  // admin-granted waiver for test/demo accounts (audit-logged when granted; see routes/users.ts).
  if (!user.mfaEnabled && !user.mfaExempt && !ENROLLMENT_ALLOWED_PATHS.has(req.originalUrl.split("?")[0]!)) {
    res.status(403).json({
      error: "Two-factor authentication is required. Finish enrolling to continue.",
      code: "mfa_enrollment_required",
    });
    return;
  }
  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
    mfaExempt: user.mfaExempt,
    mfaGraceMinutes: user.mfaGraceMinutes,
  };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

/**
 * Lightweight CSRF mitigation for the cookie-session model: state-changing requests must carry
 * this custom header. A cross-site form post (the classic CSRF vector) can't set custom headers,
 * so this is enough defense-in-depth on top of the sameSite=lax cookie without needing a full
 * token-exchange CSRF scheme for a small internal tool.
 */
export function requireXhrHeader(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  if (req.header("X-Watchtower-Client") !== "1") {
    res.status(403).json({ error: "Missing required client header." });
    return;
  }
  next();
}
