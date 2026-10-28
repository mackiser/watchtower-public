import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  buildEnrollment,
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  decryptSecret,
  encryptSecret,
  forgetTrustedDevices,
  generateRecoveryCodes,
  generateSecret,
  hasTrustedDevice,
  issueTrustedDevice,
  MAX_GRACE_MINUTES,
  PENDING_MFA_MAX_MS,
  replaceRecoveryCodes,
  verifyTotpStep,
} from "../lib/mfa.js";
import { audit, clientIp } from "../lib/audit.js";
import { isDemo } from "../lib/demoMode.js";
import { passwordSchema } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 attempts / 15 min / IP — blunts brute force without locking out a whole office NAT
  standardHeaders: true,
  legacyHeaders: false,
  // JSON body so the frontend's error handling can show it (the default is plain text, which
  // the fetch wrapper can't parse and surfaces as "Request failed (429)").
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
  handler: (req, res, _next, options) => {
    audit("rate_limit.exceeded", { route: "login", ip: clientIp(req) });
    res.status(options.statusCode).json(options.message);
  },
});

// Tighter than the password limiter — a 6-digit TOTP is only a 10^6 space, so the second step
// needs its own aggressive cap.
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many codes entered. Try again in a few minutes." },
  handler: (req, res, _next, options) => {
    audit("rate_limit.exceeded", { route: "login/mfa", ip: clientIp(req) });
    res.status(options.statusCode).json(options.message);
  },
});

// Compared against when the email doesn't match any user, so unknown and known emails take the
// same ~100ms bcrypt time — otherwise response timing leaks which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

type UserRow = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

// Per-ACCOUNT lockout, on top of the per-IP limiters above (which a distributed attacker
// sidesteps): this many consecutive failed password/MFA attempts locks the account for the
// cooldown. finalizeLogin and the admin unlock both reset it.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function lockedMessage(until: Date): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `Too many failed attempts — this account is locked for the next ${mins} minute${mins === 1 ? "" : "s"}. An admin can unlock it sooner.`;
}

/** Records one failed password/MFA attempt; locks the account at the cap. Returns the lock
 *  expiry if this failure triggered the lock, else null. */
async function registerAuthFailure(user: UserRow, ip: string): Promise<Date | null> {
  // The public demo shares one published login — a stranger's typos must not lock everyone out.
  if (isDemo()) return null;
  const failed = user.failedLoginCount + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
    // Count resets with the lock, so the account gets a fresh window once it expires.
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil } });
    audit("login.lockout", { userId: user.id, email: user.email, ip, minutes: LOCK_MINUTES });
    return lockedUntil;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failed } });
  return null;
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    mfaEnabled: u.mfaEnabled,
    mfaExempt: u.mfaExempt,
    mfaGraceMinutes: u.mfaGraceMinutes,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
}

// Regenerate so the authenticated session gets a fresh ID — never reuse whatever session ID the
// browser walked in with (session fixation). Used for every path that fully signs a user in.
async function finalizeLogin(req: Request, res: Response, user: UserRow) {
  // Stamp before responding so the login response and the admin users list agree. This is the
  // single funnel for every successful auth (password-only, MFA completion, trusted device).
  const stamped = await prisma.user.update({
    where: { id: user.id },
    // A successful sign-in also clears the brute-force counters — consecutive failures only.
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  req.session.regenerate((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong." });
      return;
    }
    req.session.userId = user.id;
    // Anchor for the absolute session lifetime (checked in requireAuth). Set post-regenerate,
    // so it's fresh for every authentication, including MFA completions.
    req.session.loginAt = Date.now();
    audit("login.success", { userId: user.id, email: user.email, ip: clientIp(req) });
    res.json(publicUser(stamped));
  });
}

/**
 * Verifies a second factor against either the user's TOTP secret or an unused recovery code.
 * Returns the matched TOTP step (for replay tracking) so the caller can advance totpLastStep.
 */
async function verifySecondFactor(user: UserRow, code: string): Promise<{ ok: boolean; step: number | null }> {
  if (!user.totpSecret) return { ok: false, step: null };
  const step = verifyTotpStep(code, decryptSecret(user.totpSecret));
  if (step !== null) {
    // Reject a code that's already been used within its (or a prior) window.
    if (user.totpLastStep !== null && step <= user.totpLastStep) return { ok: false, step: null };
    return { ok: true, step };
  }
  const recovered = await consumeRecoveryCode(user.id, code);
  return { ok: recovered, step: null };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Locked accounts don't even get a password check — the whole point is stopping guesses.
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    audit("login.failure", { email: user.email, ip: clientIp(req), reason: "locked" });
    res.status(429).json({ error: lockedMessage(user.lockedUntil) });
    return;
  }
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    audit("login.failure", { email: email.toLowerCase(), ip: clientIp(req) });
    if (user) {
      const locked = await registerAuthFailure(user, clientIp(req));
      if (locked) {
        res.status(429).json({ error: lockedMessage(locked) });
        return;
      }
    }
    res.status(401).json({ error: "Incorrect email or password." });
    return;
  }

  // No MFA, or this browser is still within its trusted-device grace window → sign in directly.
  if (!user.mfaEnabled || (await hasTrustedDevice(req, user.id))) {
    await finalizeLogin(req, res, user);
    return;
  }

  // Password was correct but a second factor is required. Regenerate to a fresh session (fixation
  // defense) that only carries the pending marker — requireAuth checks userId, so this grants no
  // access until /login/mfa completes.
  req.session.regenerate((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong." });
      return;
    }
    req.session.pendingMfaUserId = user.id;
    req.session.pendingMfaAt = Date.now();
    res.json({ mfaRequired: true });
  });
});

const mfaCodeSchema = z.object({ code: z.string().trim().min(1) });

authRouter.post("/login/mfa", mfaLimiter, async (req, res) => {
  const userId = req.session.pendingMfaUserId;
  const at = req.session.pendingMfaAt;
  if (!userId || !at || Date.now() - at > PENDING_MFA_MAX_MS) {
    res.status(401).json({ error: "Your sign-in expired — enter your password again." });
    return;
  }
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your authentication code." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabled) {
    res.status(401).json({ error: "Your sign-in expired — enter your password again." });
    return;
  }
  // MFA guesses count toward the same per-account lockout as password guesses.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    res.status(429).json({ error: lockedMessage(user.lockedUntil) });
    return;
  }
  const { ok, step } = await verifySecondFactor(user, parsed.data.code);
  if (!ok) {
    audit("login.mfa_failure", { userId: user.id, email: user.email, ip: clientIp(req) });
    const locked = await registerAuthFailure(user, clientIp(req));
    if (locked) {
      res.status(429).json({ error: lockedMessage(locked) });
      return;
    }
    res.status(401).json({ error: "That code isn't right. Try again or use a recovery code." });
    return;
  }
  if (step !== null) {
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
  }
  // Remember this browser for the grace window (fixed at check time — see issueTrustedDevice).
  if (user.mfaGraceMinutes > 0) {
    await issueTrustedDevice(req, res, user.id, user.mfaGraceMinutes);
  }
  await finalizeLogin(req, res, user);
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

authRouter.post("/password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "The new password must be different from the current one." });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  // Changing the password invalidates every *other* session for this account — if it was
  // changed because the old one leaked, whoever holds the old sessions is signed out.
  await prisma.session.deleteMany({
    where: {
      sid: { not: req.sessionID },
      sess: { path: ["userId"], equals: user.id },
    },
  });
  res.status(204).end();
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name can't be empty.").max(100, "Name is too long."),
});

// Lets a signed-in user change their own display name. Email and role are intentionally not
// editable here — email is the login identity, and role is an admin-only concern.
authRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: parsed.data.name },
  });
  res.json(publicUser(user));
});

// ---------- MFA enrollment & management (all require an authenticated session) ----------

// Begins enrollment: stashes a pending (encrypted) secret and returns a QR + manual key. MFA is
// not active until /mfa/enable confirms a code.
authRouter.post("/mfa/setup", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  if (user.mfaEnabled) {
    res.status(400).json({ error: "Two-factor authentication is already on." });
    return;
  }
  // Idempotent: reuse any existing pending secret rather than minting a new one. Reopening the
  // setup modal — or React StrictMode double-invoking the trigger — must not leave the shown QR
  // out of sync with what's stored.
  let secret: string | null = null;
  if (user.totpSecret) {
    try {
      secret = decryptSecret(user.totpSecret);
    } catch {
      secret = null; // key rotated or corrupt — fall through and regenerate
    }
  }
  if (!secret) {
    secret = generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret) } });
  }
  const { qrDataUrl, otpauthUri } = await buildEnrollment(user.email, secret);
  res.json({ qrDataUrl, otpauthUri, secret });
});

// Confirms enrollment with a first valid code, flips MFA on, and returns one-time recovery codes.
authRouter.post("/mfa/enable", requireAuth, async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the code from your authenticator app." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  if (user.mfaEnabled) {
    res.status(400).json({ error: "Two-factor authentication is already on." });
    return;
  }
  if (!user.totpSecret) {
    res.status(400).json({ error: "Start setup again — no pending secret found." });
    return;
  }
  const step = verifyTotpStep(parsed.data.code, decryptSecret(user.totpSecret));
  if (step === null) {
    res.status(400).json({ error: "That code isn't right — check your authenticator and try again." });
    return;
  }
  const codes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, totpLastStep: step } });
  await replaceRecoveryCodes(user.id, codes);
  audit("mfa.enabled", { userId: user.id, email: user.email, ip: clientIp(req) });
  res.json({ recoveryCodes: codes });
});

const disableSchema = z.object({ password: z.string().min(1), code: z.string().trim().min(1) });

// Disabling is sensitive, so it takes both the password and a current second factor.
authRouter.post("/mfa/disable", requireAuth, async (req, res) => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your password and a current code." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.mfaEnabled) {
    res.status(400).json({ error: "Two-factor authentication isn't on." });
    return;
  }
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Password is incorrect." });
    return;
  }
  const { ok } = await verifySecondFactor(user, parsed.data.code);
  if (!ok) {
    res.status(401).json({ error: "That code isn't right." });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, totpSecret: null, totpLastStep: null, mfaGraceMinutes: 0 },
  });
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  await forgetTrustedDevices(user.id, res);
  audit("mfa.disabled", { userId: user.id, email: user.email, ip: clientIp(req) });
  res.status(204).end();
});

// Regenerating replaces every recovery code — gated behind a current code so a walk-up attacker
// on an unlocked session can't silently mint themselves a fresh set.
authRouter.post("/mfa/recovery-codes", requireAuth, async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a current authentication code." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.mfaEnabled) {
    res.status(400).json({ error: "Two-factor authentication isn't on." });
    return;
  }
  const { ok } = await verifySecondFactor(user, parsed.data.code);
  if (!ok) {
    res.status(401).json({ error: "That code isn't right." });
    return;
  }
  const codes = generateRecoveryCodes();
  await replaceRecoveryCodes(user.id, codes);
  res.json({ recoveryCodes: codes });
});

const graceSchema = z.object({
  minutes: z.number().int().min(0).max(MAX_GRACE_MINUTES, `Grace period can't exceed ${MAX_GRACE_MINUTES} minutes.`),
});

// The per-user grace-period setting. Changing it revokes existing trusted devices so a shortened
// window can't be undercut by a token minted under the old, longer one.
authRouter.patch("/mfa/grace", requireAuth, async (req, res) => {
  const parsed = graceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid value." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.mfaEnabled) {
    res.status(400).json({ error: "Turn on two-factor authentication first." });
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { mfaGraceMinutes: parsed.data.minutes } });
  await forgetTrustedDevices(user.id, res);
  res.json({ mfaGraceMinutes: parsed.data.minutes });
});

authRouter.post("/mfa/forget-devices", requireAuth, async (req, res) => {
  await forgetTrustedDevices(req.user!.id, res);
  res.status(204).end();
});

// Lightweight status for the Security page (never returns the secret).
authRouter.get("/mfa/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json({
    mfaEnabled: user.mfaEnabled,
    mfaGraceMinutes: user.mfaGraceMinutes,
    recoveryCodesRemaining: user.mfaEnabled ? await countUnusedRecoveryCodes(user.id) : 0,
  });
});

authRouter.post("/logout", (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(() => {
    res.clearCookie("watchtower.sid");
    if (userId) audit("logout", { userId, ip: clientIp(req) });
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
