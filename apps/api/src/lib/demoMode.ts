import type { NextFunction, Request, Response } from "express";

/** Public read-only demo (DEMO_SEED=1): fictional data, a published login, no writes. */
export const isDemo = (): boolean => process.env.DEMO_SEED === "1";

// The only mutations a demo visitor needs: signing in and out. Everything else is read-only, which
// also covers password changes, user management and MFA enrollment — a shared public login must
// not be able to lock other visitors out or vandalize the data.
const DEMO_WRITE_ALLOWED = new Set(["/api/auth/login", "/api/auth/login/mfa", "/api/auth/logout"]);

/** True when a demo should refuse this request (a write that isn't sign-in/out). */
export function blocksDemoWrite(method: string, path: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  return !DEMO_WRITE_ALLOWED.has(path.replace(/\/+$/, ""));
}

export function demoReadOnly(req: Request, res: Response, next: NextFunction): void {
  if (isDemo() && blocksDemoWrite(req.method, req.path)) {
    res.status(403).json({ error: "This is a read-only demo — changes are disabled." });
    return;
  }
  next();
}
