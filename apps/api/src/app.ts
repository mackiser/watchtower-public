// Must be imported before any routes are registered: it monkey-patches Express so that a rejected
// promise thrown from an async route handler is forwarded to the error middleware below, instead
// of becoming an unhandledRejection that hangs the request (Express 4 doesn't catch these itself).
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoFreshness } from "./lib/demoFakeSync.js";
import { demoReadOnly } from "./lib/demoMode.js";
import { sessionMiddleware } from "./lib/session.js";
import { requireAdmin, requireAuth, requireXhrHeader } from "./middleware/auth.js";
import { mutationLimiter } from "./middleware/rateLimit.js";
import { auditEventsRouter } from "./routes/auditEvents.js";
import { authRouter } from "./routes/auth.js";
import { searchRouter } from "./routes/search.js";
import { clientsRouter, qualysKbRouter } from "./routes/clients.js";
import { tasksRouter } from "./routes/tasks.js";
import { userOptionsRouter, usersRouter } from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, "../../web/dist");

export function createApp() {
  const app = express();

  // Production sits behind a TLS-terminating reverse proxy — trust it so `secure` cookies and
  // rate-limit IP detection work correctly.
  app.set("trust proxy", 1);

  // Standard security headers (CSP, X-Content-Type-Options, frame-ancestors, HSTS, etc.).
  // The built frontend has no inline scripts or external assets, so helmet's default CSP works
  // as-is — except upgrade-insecure-requests, which would rewrite asset URLs to https on the
  // plain-HTTP local deployments that COOKIE_SECURE=false exists for (see lib/session.ts).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "upgrade-insecure-requests": null,
        },
      },
      // HSTS is left to the TLS-terminating proxy / host in front of the app; browsers ignore it
      // over plain HTTP anyway, so a self-hosted LAN install gains nothing from it here.
      strictTransportSecurity: false,
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  // Parses the trusted-device cookie the MFA grace period relies on (express-session only reads
  // its own cookie).
  app.use(cookieParser());

  // Only relevant in local dev, where the Vite dev server runs on a different port than the
  // API; in production the API serves the built frontend itself, so this is same-origin.
  if (process.env.NODE_ENV !== "production" && process.env.WEB_DEV_ORIGIN) {
    app.use(cors({ origin: process.env.WEB_DEV_ORIGIN, credentials: true }));
  }

  app.use(sessionMiddleware);
  app.use(requireXhrHeader);
  // Public demo only (DEMO_SEED=1): refuse every write except sign-in/out. No-op otherwise.
  app.use(demoReadOnly);

  app.use("/api/auth", authRouter);
  app.use("/api/clients", mutationLimiter, requireAuth, demoFreshness, clientsRouter);
  app.use("/api/clients/:clientId/tasks", mutationLimiter, requireAuth, tasksRouter);
  app.use("/api/users", mutationLimiter, requireAuth, requireAdmin, usersRouter);
  app.use("/api/user-options", requireAuth, userOptionsRouter);
  app.use("/api/search", requireAuth, searchRouter);
  // Vendor reference text for a QID — readable by anyone who can already see the client page.
  app.use("/api/qualys-kb", mutationLimiter, requireAuth, qualysKbRouter);
  app.use("/api/audit-events", requireAuth, requireAdmin, auditEventsRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Any other /api/* path is a real 404 (not an SPA route) — answer in JSON so the fetch client
  // parses it, instead of falling through to the HTML index.html and confusing error handling.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Serve the built React app for everything else (single-service deployment — see
  // Dockerfile/README). Falls back to index.html for client-side routes. On Vercel the platform
  // serves the static build itself and this app only ever handles /api.
  if (!process.env.VERCEL) {
    app.use(express.static(WEB_DIST));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(WEB_DIST, "index.html"));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}
