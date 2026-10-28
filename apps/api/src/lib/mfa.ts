import crypto from "node:crypto";
import type { Request, Response } from "express";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "./prisma.js";
import { cookieSecure } from "./session.js";

// Allow the code from the adjacent 30s window on each side, covering normal phone/server clock skew.
authenticator.options = { window: 1 };

const ISSUER = "Watchtower";
export const TRUSTED_DEVICE_COOKIE = "watchtower.mfa";
export const MAX_GRACE_MINUTES = 60;
// How long the half-authenticated /login → /login/mfa window stays open before the user must
// re-enter their password.
export const PENDING_MFA_MAX_MS = 5 * 60 * 1000;

// ---------- secret encryption at rest (AES-256-GCM) ----------
// The TOTP secret is a bearer credential: anyone holding it can mint valid codes. Encrypting it
// means a database leak alone isn't enough — you'd also need MFA_ENCRYPTION_KEY from the env.
function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error("MFA_ENCRYPTION_KEY env var must be set (16+ random chars) to use multi-factor auth.");
  }
  // Accept any passphrase; derive a stable 32-byte key from it.
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, encB] = blob.split(":");
  if (!ivB || !tagB || !encB) throw new Error("Malformed encrypted TOTP secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

// ---------- TOTP ----------
export function generateSecret(): string {
  return authenticator.generateSecret();
}

export async function buildEnrollment(email: string, secret: string): Promise<{ otpauthUri: string; qrDataUrl: string }> {
  const otpauthUri = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  return { otpauthUri, qrDataUrl };
}

/**
 * Verifies a TOTP token and returns the time-step it matched (for replay tracking), or null if it
 * doesn't match. Callers compare the step against User.totpLastStep to reject a reused code.
 */
export function verifyTotpStep(token: string, secret: string): number | null {
  const delta = authenticator.checkDelta(token.replace(/\s/g, ""), secret);
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}

// ---------- recovery codes ----------
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/** Generates human-friendly single-use codes like "3f9a-b1c2-77de" (~48 bits each). */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const hex = crypto.randomBytes(6).toString("hex"); // 12 hex chars
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  });
}

export async function replaceRecoveryCodes(userId: string, codes: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashCode(c) })) }),
  ]);
}

/** Consumes a matching unused recovery code (marks it used). Returns true on success. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const rec = await prisma.mfaRecoveryCode.findFirst({ where: { userId, codeHash: hashCode(code), usedAt: null } });
  if (!rec) return false;
  await prisma.mfaRecoveryCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return true;
}

export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

// ---------- trusted devices (grace period) ----------
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** True if this browser holds a still-valid trusted-device cookie for the user. Does not extend it. */
export async function hasTrustedDevice(req: Request, userId: string): Promise<boolean> {
  const token = req.cookies?.[TRUSTED_DEVICE_COOKIE];
  if (!token || typeof token !== "string") return false;
  const device = await prisma.mfaTrustedDevice.findFirst({
    where: { userId, tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
  });
  if (!device) return false;
  // Weak second binding — a stolen cookie replayed from a different browser is rejected.
  const ua = req.header("user-agent") ?? null;
  if (device.userAgent && device.userAgent !== ua) return false;
  return true;
}

/**
 * Issues a fresh trusted-device token good for the user's grace window and sets the cookie. Note
 * the window is fixed at MFA time and never rolled forward on later trusted sign-ins, so a user is
 * always re-prompted within mfaGraceMinutes of their last real MFA check.
 */
export async function issueTrustedDevice(req: Request, res: Response, userId: string, graceMinutes: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAgeMs = graceMinutes * 60 * 1000;
  await prisma.mfaTrustedDevice.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + maxAgeMs),
      userAgent: (req.header("user-agent") ?? "").slice(0, 255) || null,
    },
  });
  res.cookie(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    maxAge: maxAgeMs,
    path: "/api/auth",
  });
}

export async function forgetTrustedDevices(userId: string, res?: Response): Promise<void> {
  await prisma.mfaTrustedDevice.deleteMany({ where: { userId } });
  if (res) res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/api/auth" });
}
