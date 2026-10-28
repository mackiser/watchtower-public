import { Prisma } from "../../prisma/generated/index.js";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { audit, clientIp } from "../lib/audit.js";
import { forgetTrustedDevices } from "../lib/mfa.js";
import { passwordSchema } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

// Assignment dropdown data for ANY signed-in user (the full usersRouter below is admin-only at
// its mount). Names only — no emails, roles, or security state.
export const userOptionsRouter = Router();
userOptionsRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  res.json(users);
});

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  mustChangePassword: true,
  mfaEnabled: true,
  mfaExempt: true,
  mfaGraceMinutes: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
} as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: passwordSchema,
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  // Waives the mandatory-MFA enrollment gate for this account (test/demo logins). Defaults to
  // false so the secure path stays the default; granting it is audit-logged below.
  mfaExempt: z.boolean().default(false),
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }
  const { email, name, password, role, mfaExempt } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    res.status(409).json({ error: "A user with that email already exists." });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({
      // mustChangePassword: the admin knows this temporary password, so the account holder has
      // to replace it on first sign-in before using the app.
      data: { email: email.toLowerCase(), name, passwordHash, role, mustChangePassword: true, mfaExempt },
      select: USER_SELECT,
    });
    audit("user.create", { actorId: req.user?.id, targetId: user.id, email: user.email, role: user.role, mfaExempt, ip: clientIp(req) });
    // Separate event so a 2FA waiver is greppable on its own, not buried in a create record.
    if (mfaExempt) {
      audit("user.mfa_exempt_change", { actorId: req.user?.id, targetId: user.id, email: user.email, mfaExempt: true, at: "create", ip: clientIp(req) });
    }
    res.status(201).json(user);
  } catch (err) {
    // Unique-constraint race: two concurrent creates can both pass the findUnique check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "A user with that email already exists." });
      return;
    }
    throw err;
  }
});

// Admin password reset: issues a new temporary password (e.g. someone forgot theirs — there's
// no email infrastructure for self-service reset links) and signs the user out everywhere.
const resetPasswordSchema = z.object({
  password: passwordSchema,
});

usersRouter.patch("/:id/password", async (req, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "Use the change-password form for your own account." });
    return;
  }
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true },
  });
  await prisma.session.deleteMany({ where: { sess: { path: ["userId"], equals: target.id } } });
  audit("user.password_reset", { actorId: req.user?.id, targetId: target.id, email: target.email, ip: clientIp(req) });
  res.status(204).end();
});

// Admin MFA reset for a locked-out teammate (lost authenticator *and* recovery codes). Admins can
// only turn MFA off — never enroll on someone's behalf — and the user is signed out everywhere.
usersRouter.delete("/:id/mfa", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { mfaEnabled: false, totpSecret: null, totpLastStep: null, mfaGraceMinutes: 0 },
  });
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: target.id } });
  await forgetTrustedDevices(target.id);
  await prisma.session.deleteMany({ where: { sess: { path: ["userId"], equals: target.id } } });
  audit("user.mfa_reset", { actorId: req.user?.id, targetId: target.id, email: target.email, ip: clientIp(req) });
  res.status(204).end();
});

// Grants/revokes the mandatory-MFA waiver for an existing account. Admins can't waive their own
// requirement — same self-guard as role changes, so weakening your own account's auth always
// takes a second admin. Revoking takes effect on the target's next request (requireAuth reloads
// the user every time), pushing them to the enrollment gate.
const mfaExemptSchema = z.object({ mfaExempt: z.boolean() });

usersRouter.patch("/:id/mfa-exempt", async (req, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "You can't change your own two-factor requirement." });
    return;
  }
  const parsed = mfaExemptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { mfaExempt: parsed.data.mfaExempt },
    select: USER_SELECT,
  });
  audit("user.mfa_exempt_change", {
    actorId: req.user?.id,
    targetId: target.id,
    email: target.email,
    mfaExempt: parsed.data.mfaExempt,
    ip: clientIp(req),
  });
  res.json(user);
});

// Clears a brute-force lockout (and the failure counter) so the user can try again immediately
// instead of waiting out the cooldown.
usersRouter.post("/:id/unlock", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { failedLoginCount: 0, lockedUntil: null },
    select: USER_SELECT,
  });
  audit("user.unlock", { actorId: req.user?.id, targetId: target.id, email: target.email, ip: clientIp(req) });
  res.json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "You can't delete your own account." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(204).end(); // already gone — deletion is idempotent
    return;
  }
  // Never delete the last admin: with no signup route, an admin-less workspace can only be
  // recovered by re-running the seed script against the database.
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      res.status(400).json({ error: "Can't remove the last admin." });
      return;
    }
  }
  await prisma.user.delete({ where: { id: target.id } }).catch(() => null);
  audit("user.delete", { actorId: req.user?.id, targetId: target.id, email: target.email, role: target.role, ip: clientIp(req) });
  res.status(204).end();
});

// Promote/demote a teammate between ADMIN and MEMBER. requireAuth reloads role from the DB on
// every request, so a change takes effect on the target's very next call — no forced sign-out.
const setRoleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

usersRouter.patch("/:id/role", async (req, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "You can't change your own role." });
    return;
  }
  const parsed = setRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  // Same guard as delete: never leave the workspace with zero admins (there's no signup route
  // to recover from that).
  if (target.role === "ADMIN" && parsed.data.role === "MEMBER") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      res.status(400).json({ error: "Can't remove the last admin." });
      return;
    }
  }
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
    select: USER_SELECT,
  });
  audit("user.role_change", { actorId: req.user?.id, targetId: user.id, email: user.email, role: user.role, ip: clientIp(req) });
  res.json(user);
});
