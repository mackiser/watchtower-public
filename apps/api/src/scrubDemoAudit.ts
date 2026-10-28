// One-off for the public demo database: strips visitor IPs and typed emails from audit rows written
// before demo-mode redaction existed (see lib/audit.ts). Refuses to run unless DEMO_SEED=1 so it
// can't be pointed at a real database by mistake. Run with `npm run demo:scrub-audit`.
import { isDemo } from "./lib/demoMode.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  if (!isDemo()) {
    console.error("Refusing to run: DEMO_SEED is not 1, so this doesn't look like the demo database.");
    process.exit(1);
  }
  const ips = await prisma.authEvent.updateMany({ where: { ip: { not: null } }, data: { ip: null } });
  const emails = await prisma.authEvent.updateMany({
    where: { email: { not: null }, event: { notIn: ["login.success", "logout"] } },
    data: { email: null },
  });
  console.log(`Cleared ${ips.count} IP address(es) and ${emails.count} email(s) from the audit log.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
