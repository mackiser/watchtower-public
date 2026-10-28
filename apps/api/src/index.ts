import { createApp } from "./app.js";
import { initAuditPrune } from "./lib/audit.js";
import { prisma } from "./lib/prisma.js";
import { initSyncSchedule } from "./lib/qualysSync.js";

const port = Number(process.env.PORT) || 4000;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Watchtower API listening on :${port}`);
});

// Daily Qualys pull (default 17:00 America/New_York; admin-editable via PUT
// /api/clients/sync-schedule, persisted in the Setting table). Interrupted/failed runs
// self-heal: the snapshot upsert is idempotent per day and admins can Sync now any time.
initSyncSchedule().catch((err) => console.error("qualys sync schedule init:", err));

// Nightly prune of the persisted audit trail (365-day retention — see lib/audit.ts).
initAuditPrune();

// Last-resort backstops. Route-level async throws are handled by express-async-errors → the error
// middleware; these catch anything outside a request (a rejected timer, a bad event handler) so
// the process logs the cause instead of dying silently or, worse, limping on in a bad state.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  // An uncaught exception leaves the process in an undefined state — drain and exit so the
  // container restarts clean rather than serving from corrupted state.
  shutdown("uncaughtException", 1);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests finish, close the DB,
// then exit. Without this, SIGTERM (docker stop / redeploy) kills in-flight requests mid-write.
let shuttingDown = false;
function shutdown(signal: string, code = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down.`);
  // Hard cap: if a hung request keeps the server from closing, exit anyway rather than hang forever.
  const forced = setTimeout(() => {
    console.error("Shutdown timed out — forcing exit.");
    process.exit(code || 1);
  }, 10_000);
  forced.unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(code);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
