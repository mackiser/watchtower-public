import { Router } from "express";
import { prisma } from "../lib/prisma.js";

// Read-only admin view over the persisted audit trail (lib/audit.ts writes the rows).
// Mounted behind requireAuth + requireAdmin in app.ts.
export const auditEventsRouter = Router();

auditEventsRouter.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const q = String(req.query.q ?? "").trim();
  // One search box over the identifying fields — an admin is answering "what happened with
  // this email/IP/event type", not composing per-column filters.
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { event: { contains: q, mode: "insensitive" as const } },
          { ip: { contains: q } },
        ],
      }
    : {};
  const events = await prisma.authEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  res.json(events);
});
