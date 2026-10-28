import { Router } from "express";
import { prisma } from "../lib/prisma.js";

// Cross-surface search for the Ctrl+K palette: client names, task titles/notes, ISPM control
// names — three cheap contains-queries in parallel, capped per group. Archived clients (and
// their tasks/controls) are excluded; the palette is a jump-to-work tool, not an archive browser.
export const searchRouter = Router();

const PER_GROUP = 8;

searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ clients: [], tasks: [], controls: [] });
    return;
  }
  const contains = { contains: q, mode: "insensitive" as const };
  const [clients, tasks, controls] = await Promise.all([
    prisma.client.findMany({
      where: { name: contains, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: PER_GROUP,
    }),
    prisma.task.findMany({
      where: { OR: [{ title: contains }, { note: contains }], client: { archivedAt: null } },
      select: { id: true, title: true, status: true, clientId: true, client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    }),
    prisma.ispmControl.findMany({
      where: { control: contains, client: { archivedAt: null } },
      select: { id: true, control: true, compliant: true, clientId: true, client: { select: { name: true } } },
      orderBy: { control: "asc" },
      take: PER_GROUP,
    }),
  ]);
  res.json({
    clients,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.status === "DONE",
      clientId: t.clientId,
      clientName: t.client.name,
    })),
    controls: controls.map((c) => ({
      id: c.id,
      control: c.control,
      compliant: c.compliant,
      clientId: c.clientId,
      clientName: c.client.name,
    })),
  });
});
