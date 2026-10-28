// Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars.
// There's no public signup route by design — this is the only way to
// bootstrap the first login; every other account is created via Admin > Users afterward.
// Safe to re-run: no-ops if that email already exists.
import bcrypt from "bcryptjs";
import { isDemo } from "./lib/demoMode.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Admin user ${email} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    // mustChangePassword: the bootstrap ADMIN_PASSWORD comes from an env var (often committed to a
    // deploy config / shared in setup notes), so the admin must replace it on first sign-in before
    // using the app — same first-login rotation every admin-created account gets (see users.ts).
    // The public demo is the exception: its login is published on the sign-in page, the API is
    // read-only, and visitors shouldn't have to enroll an authenticator, so it skips both gates.
    data: {
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: "ADMIN",
      mustChangePassword: !isDemo(),
      mfaExempt: isDemo(),
    },
  });
  console.log(`Created admin user ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
