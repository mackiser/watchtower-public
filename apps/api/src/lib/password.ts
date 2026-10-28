import { z } from "zod";

// One password policy for every path that sets a password (self change, admin create, admin
// reset). 12+ characters with at least one letter and one digit — a pragmatic compliance-friendly
// floor without a strength-estimation dependency. Applies to NEW passwords only; existing
// hashes keep working at login.
// ponytail: length + two character classes, not zxcvbn — add real strength estimation only if
// weak-but-compliant passwords actually show up.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(200, "Password is too long.")
  .regex(/[a-zA-Z]/, "Password must include at least one letter.")
  .regex(/[0-9]/, "Password must include at least one number.");
