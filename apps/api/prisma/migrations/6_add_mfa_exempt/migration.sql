-- Admin-granted waiver from the mandatory-MFA enrollment gate (test/demo accounts).
-- Defaults to false so every existing account keeps the enrollment requirement.
ALTER TABLE "User" ADD COLUMN "mfaExempt" BOOLEAN NOT NULL DEFAULT false;
