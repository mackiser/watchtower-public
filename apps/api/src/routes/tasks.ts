import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { linkTypeToDb, serializeTask, taskPriorityToDb, taskStatusToDb } from "../lib/serialize.js";

// Mounted at /api/clients/:clientId/tasks with mergeParams so req.params.clientId is available.
// Express's types don't know about mergeParams, so route handlers below type req.params
// explicitly instead of relying on inference.
export const tasksRouter = Router({ mergeParams: true });

type ClientParams = { clientId: string };
type TaskParams = { clientId: string; taskId: string };

const STATUS_VALUES = ["To Do", "In Progress", "Done"] as const;
const PRIORITY_VALUES = ["Low", "Medium", "High"] as const;
const LINK_TYPE_VALUES = ["ispm", "qualys"] as const;

// Every read joins the assignee's display name — the board shows who owns a card without a
// second request. select-not-include keeps the payload to just the name.
const WITH_ASSIGNEE = { assignee: { select: { name: true } } } as const;

/** Date-only strings store as midnight UTC, matching how snapshot dates round-trip. */
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be yyyy-mm-dd.")
  .nullable();
function dueDateToDb(d: string | null): Date | null {
  return d ? new Date(`${d}T00:00:00.000Z`) : null;
}

/** null = valid (or no assignee); string = error message. */
async function assigneeInvalid(assigneeId: string | null | undefined): Promise<string | null> {
  if (!assigneeId) return null;
  const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
  return user ? null : "That teammate no longer exists.";
}

tasksRouter.get("/", async (req: Request<ClientParams>, res) => {
  const tasks = await prisma.task.findMany({
    where: { clientId: req.params.clientId },
    orderBy: { createdAt: "asc" },
    include: WITH_ASSIGNEE,
  });
  res.json(tasks.map(serializeTask));
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  status: z.enum(STATUS_VALUES).default("To Do"),
  note: z.string().max(2000).default(""),
  priority: z.enum(PRIORITY_VALUES).default("Medium"),
  dueDate: dueDateSchema.default(null),
  assigneeId: z.string().nullable().default(null),
  linkType: z.enum(LINK_TYPE_VALUES).nullable().default(null),
  linkRef: z.string().max(200).default(""),
});

tasksRouter.post("/", async (req: Request<ClientParams>, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid task." });
    return;
  }
  const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }
  const assigneeError = await assigneeInvalid(parsed.data.assigneeId);
  if (assigneeError) {
    res.status(400).json({ error: assigneeError });
    return;
  }
  const { status, linkType, priority, dueDate, ...rest } = parsed.data;
  const task = await prisma.task.create({
    data: {
      ...rest,
      clientId: client.id,
      status: taskStatusToDb(status),
      priority: taskPriorityToDb(priority),
      dueDate: dueDateToDb(dueDate),
      linkType: linkTypeToDb(linkType),
      completedAt: status === "Done" ? new Date() : null,
    },
    include: WITH_ASSIGNEE,
  });
  res.status(201).json(serializeTask(task));
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  note: z.string().max(2000).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dueDate: dueDateSchema.optional(),
  assigneeId: z.string().nullable().optional(),
  linkType: z.enum(LINK_TYPE_VALUES).nullable().optional(),
  linkRef: z.string().max(200).optional(),
});

tasksRouter.patch("/:taskId", async (req: Request<TaskParams>, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid update." });
    return;
  }
  const existing = await prisma.task.findFirst({
    where: { id: req.params.taskId, clientId: req.params.clientId },
  });
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const assigneeError = await assigneeInvalid(parsed.data.assigneeId);
  if (assigneeError) {
    res.status(400).json({ error: assigneeError });
    return;
  }
  const { status, linkType, priority, dueDate, ...rest } = parsed.data;
  // Moving a card to Done stamps completedAt; moving it back out clears that stamp — mirrors the
  // original board's moveTask() behavior (index.html:1584-1593) so completion dates always
  // reflect current state rather than accumulating history.
  let completedAt = existing.completedAt;
  if (status) {
    if (status === "Done" && existing.status !== "DONE") completedAt = new Date();
    else if (status !== "Done") completedAt = null;
  }
  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(status ? { status: taskStatusToDb(status) } : {}),
      ...(priority ? { priority: taskPriorityToDb(priority) } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDateToDb(dueDate) } : {}),
      ...(linkType !== undefined ? { linkType: linkTypeToDb(linkType) } : {}),
      completedAt,
    },
    include: WITH_ASSIGNEE,
  });
  res.json(serializeTask(task));
});

tasksRouter.delete("/:taskId", async (req: Request<TaskParams>, res) => {
  await prisma.task.deleteMany({ where: { id: req.params.taskId, clientId: req.params.clientId } });
  res.status(204).end();
});
