import pgSession from "connect-pg-simple";
import session from "express-session";
import pg from "pg";

const PgSession = pgSession(session);

// Session records live in the "session" table (see prisma/schema.prisma's Session model —
// Prisma only defines the shape/index for migrations; connect-pg-simple owns reads/writes to it
// at runtime since express-session's store API predates Prisma's query engine).
// On Vercel every function instance holds its own pool, so keep it to one connection per instance.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 1 : 10 });
// Serverless Postgres (Neon) drops idle sockets; without a handler that surfaces as an unhandled
// 'error' event and crashes the process instead of the pool just opening a fresh connection.
pool.on("error", (err) => console.error("session pool:", err.message));

const isProd = process.env.NODE_ENV === "production";

// Secure cookies require HTTPS — true by default in production (correct behind a TLS-terminating
// reverse proxy), but overridable via COOKIE_SECURE=false for internal/LAN deployments served
// over plain HTTP (e.g. a home server), where a Secure cookie would silently never be sent back
// by the browser and every request would look logged-out.
export const cookieSecure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : isProd;

// Idle timeout: a session ends after this long without any request touching it. `rolling: true`
// below slides the window on every request (connect-pg-simple touch updates the row's expire),
// so this is server-enforced, not just a cookie hint.
const idleMinutes = Number(process.env.SESSION_IDLE_MINUTES) || 30;

// Absolute lifetime: force re-authentication this long after login, active or not. Enforced in
// requireAuth against the session's loginAt stamp (set in finalizeLogin).
export const SESSION_ABSOLUTE_MS = (Number(process.env.SESSION_MAX_HOURS) || 12) * 3_600_000;

export const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
  name: "watchtower.sid",
  secret: requireSessionSecret(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    maxAge: 1000 * 60 * idleMinutes,
  },
});

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET env var must be set to a random string of at least 16 characters.");
  }
  return secret;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    // Stamped in finalizeLogin (post-regenerate) — the anchor for the absolute session lifetime.
    // Sessions without it (created before this feature) are treated as expired by requireAuth.
    loginAt?: number;
    // Set after a correct password when the account has MFA and this browser isn't trusted — the
    // half-authenticated state between /auth/login and /auth/login/mfa. Never grants access on its
    // own (requireAuth checks userId only); pendingMfaAt bounds how long the second step stays open.
    pendingMfaUserId?: string;
    pendingMfaAt?: number;
  }
}
