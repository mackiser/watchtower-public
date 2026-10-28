import rateLimit from "express-rate-limit";
import { audit, clientIp } from "../lib/audit.js";

// Per-IP cap on state-changing requests (POST/PUT/PATCH/DELETE) to the data routers. The auth
// router has its own tighter limiters (login/mfa); this backstops the rest — a compromised or
// buggy client can't hammer the write endpoints. Reads (GET/HEAD) are unmetered: they're cheap,
// idempotent, and drive the normal dashboard polling.
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300, // generous for real use (a Weekly Update is a burst of writes); still blunts abuse
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  message: { error: "Too many requests. Slow down and try again in a few minutes." },
  handler: (req, res, _next, options) => {
    audit("rate_limit.exceeded", { route: "mutation", path: req.originalUrl, ip: clientIp(req) });
    res.status(options.statusCode).json(options.message);
  },
});
