import { computeClientScores, GOAL_LIMITS, ispmWeightedCompliancePct, normalizeGoals } from "@watchtower/shared";
import type { ClientDetail, ClientGoals, ClientSummary } from "@watchtower/shared";
import type { Response } from "express";
import { Router } from "express";
import { Prisma } from "../../prisma/generated/index.js";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { historyRows } from "../lib/exportHistory.js";
import { prisma } from "../lib/prisma.js";
import { getSyncSchedule, qualysConfigured, setSyncSchedule, syncAllClients, syncRunning } from "../lib/qualysSync.js";
import {
  serializeIspmControl,
  serializeIspmSnapshot,
  serializeKbDetail,
  serializeSnapshot,
  serializeTask,
  serializeTopVulns,
} from "../lib/serialize.js";
import { requireAdmin } from "../middleware/auth.js";

export const clientsRouter = Router();

/**
 * The KnowledgeBase write-up for one QID, scoped to a client so the counts come along.
 *
 * Separate from the client payload on purpose: diagnosis/consequence/solution run to several KB
 * each, and ClientDetail is re-sent on every mutation on the client page — including every kanban
 * card drag. Paying that on the hottest path to save one load state in a modal that opens once a
 * session is the wrong trade. Mounted as its own small router, mirroring userOptionsRouter.
 */
export const qualysKbRouter = Router();

/** An entry-shaped blank, so a QID nobody has named yet still opens an editable detail view. */
const emptyKbEntry = (qid: string) => ({
  qid,
  title: "",
  severity: 0,
  category: "",
  patchable: false,
  cves: "",
  diagnosis: "",
  consequence: "",
  solution: "",
  notes: "",
  fromQualys: false,
  fetchedAt: new Date(),
});

qualysKbRouter.get("/:clientId/:qid", async (req, res) => {
  const { clientId, qid } = req.params;
  const [entry, vuln] = await Promise.all([
    prisma.qualysKbEntry.findUnique({ where: { qid } }),
    prisma.qualysVuln.findUnique({ where: { clientId_qid: { clientId, qid } } }),
  ]);
  // A missing entry is the normal case on this subscription — the KnowledgeBase API is not
  // entitled ("403: You are not allowed to download the KnowledgeBase"), so titles are written by
  // hand. Returning a blank rather than a 404 means the modal always has something to edit.
  res.json(serializeKbDetail(vuln, entry ?? emptyKbEntry(qid)));
});

// Hand-authored title/notes for a QID. Global, not per client: naming QID 92429 once names it for
// every client that has it, which is the whole point — the same QIDs recur across the portfolio.
//
// Open to any signed-in user, matching ISPM control editing and task creation. It's reference text
// that changes no score, so gating it to admins would be stricter than the edits next to it while
// making the feature far less likely to actually get filled in.
const kbEditSchema = z.object({
  title: z.string().trim().max(300, "That title is too long.").optional(),
  notes: z.string().max(4000, "Those notes are too long.").optional(),
});

qualysKbRouter.patch("/:qid", async (req, res) => {
  const parsed = kbEditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid vulnerability details." });
    return;
  }
  const { qid } = req.params;
  const data = parsed.data;
  const existing = await prisma.qualysKbEntry.findUnique({ where: { qid } });
  const saved = await prisma.qualysKbEntry.upsert({
    where: { qid },
    update: data,
    // fromQualys stays false: this row was authored here, so refreshKbEntries() must still fetch
    // it for real if the KnowledgeBase entitlement is ever granted.
    create: { ...emptyKbEntry(qid), ...data },
  });
  audit("qualys.kb_edit", {
    qid,
    created: !existing,
    titleChanged: data.title !== undefined && data.title !== existing?.title,
    by: req.user?.email,
  });
  res.json(serializeKbDetail(null, saved));
});

/** A client's effective goals: its own values where an admin set them, the shared default
 *  otherwise. Columns are nullable on purpose (see migration 7) — null means "follow the
 *  default", not "10". */
function goalsOf(c: { vulnTargetPerAsset: number | null; ispmTargetPct: number | null }): ClientGoals {
  return normalizeGoals({
    vulnTargetPerAsset: c.vulnTargetPerAsset ?? undefined,
    ispmTargetPct: c.ispmTargetPct ?? undefined,
  });
}

const hasCustomGoals = (c: { vulnTargetPerAsset: number | null; ispmTargetPct: number | null }): boolean =>
  c.vulnTargetPerAsset != null || c.ispmTargetPct != null;

// ---------- list (Overview page) ----------
// Archived clients are excluded by default — the Overview is a triage surface, and a churned
// client shouldn't sit in it forever. The admin clients page passes includeArchived=true to
// manage them.
clientsRouter.get("/", async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const clients = await prisma.client.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      // nulls last so undated legacy rows (from migrated workbooks with no date column) sort to
      // the end, matching the original app's chronological-sort-with-undated-tail behavior
      qualysSnapshots: { orderBy: { date: { sort: "asc", nulls: "last" } } },
      ispmControls: true,
      tasks: { where: { status: { not: "DONE" } }, select: { id: true } },
    },
  });

  const summaries: ClientSummary[] = clients.map((c) => {
    const qSeries = c.qualysSnapshots.map(serializeSnapshot);
    const ispm = c.ispmControls.map(serializeIspmControl);
    const latest = qSeries.length ? qSeries[qSeries.length - 1]! : null;
    const goals = goalsOf(c);
    const scores = computeClientScores(latest, qSeries, ispm, c.ispmNotApplicable, goals);
    return {
      id: c.id,
      name: c.name,
      ispmNotApplicable: c.ispmNotApplicable,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
      openTaskCount: c.tasks.length,
      lastQualysDate: latest?.date ?? null,
      qualysTag: c.qualysTag,
      qualysLastSyncAt: c.qualysLastSyncAt ? c.qualysLastSyncAt.toISOString() : null,
      qualysSyncError: c.qualysSyncError,
      goals,
      customGoals: hasCustomGoals(c),
      ...scores,
    };
  });

  res.json(summaries);
});

// ---------- export: scan-by-scan history for every active client ----------
// Registered before "/:id" so "export-history" isn't captured as a client id. Flat rows, not CSV:
// the web app already has downloadCsv, and keeping this JSON keeps api.get usable as-is.
clientsRouter.get("/export-history", async (_req, res) => {
  const clients = await prisma.client.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      qualysSnapshots: { orderBy: { date: { sort: "asc", nulls: "last" } } },
      ispmControls: true,
      ispmSnapshots: { orderBy: { date: "asc" } },
    },
  });
  const rows = clients.flatMap((c) => {
    const qSeries = c.qualysSnapshots.map(serializeSnapshot);
    const latest = qSeries.length ? qSeries[qSeries.length - 1]! : null;
    const goals = goalsOf(c);
    const { ispmCompliancePct } = computeClientScores(latest, qSeries, c.ispmControls.map(serializeIspmControl), c.ispmNotApplicable, goals);
    return historyRows(c.name, qSeries, c.ispmSnapshots.map(serializeIspmSnapshot), c.ispmNotApplicable, ispmCompliancePct, goals);
  });
  res.json(rows);
});

// ---------- admin: archive / unarchive ----------
const archiveSchema = z.object({ archived: z.boolean() });

clientsRouter.patch("/:id/archive", requireAdmin, async (req, res) => {
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid value." });
    return;
  }
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }
  await prisma.client.update({
    where: { id: client.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });
  res.status(204).end();
});

// ---------- admin: Qualys tag + manual sync ----------
const qualysTagSchema = z.object({ qualysTag: z.string().trim().min(1).max(200).nullable() });

clientsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = qualysTagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Qualys tag." });
    return;
  }
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }
  await prisma.client.update({
    where: { id: client.id },
    // Clear any stale sync error on tag change so a fixed tag doesn't show yesterday's failure
    // until the next 5pm run.
    data: { qualysTag: parsed.data.qualysTag, qualysSyncError: null },
  });
  res.status(204).end();
});

// Registered before GET /:id below — express matches in order, and "sync-schedule" must not be
// swallowed as a client id.
const scheduleSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour)."),
});

clientsRouter.get("/sync-schedule", async (_req, res) => {
  res.json(await getSyncSchedule());
});

clientsRouter.put("/sync-schedule", requireAdmin, async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid schedule." });
    return;
  }
  const schedule = await setSyncSchedule(parsed.data);
  audit("qualys.schedule_change", { enabled: parsed.data.enabled, time: parsed.data.time, by: req.user?.email });
  res.json(schedule);
});

const syncSchema = z.object({ clientId: z.string().optional() });

clientsRouter.post("/sync-qualys", requireAdmin, async (req, res) => {
  const parsed = syncSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  if (!qualysConfigured()) {
    res.status(503).json({ error: "Qualys sync is not configured — set QUALYS_USERNAME/QUALYS_PASSWORD." });
    return;
  }
  if (syncRunning()) {
    res.status(409).json({ error: "A Qualys sync is already running." });
    return;
  }
  const results = await syncAllClients(parsed.data.clientId);
  res.json(results);
});

const createClientSchema = z.object({ name: z.string().trim().min(1).max(200) });

clientsRouter.post("/", async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a client name." });
    return;
  }
  const existing = await prisma.client.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    res.status(409).json({ error: "A client with that name already exists." });
    return;
  }
  try {
    const client = await prisma.client.create({ data: { name: parsed.data.name } });
    res.status(201).json({ id: client.id, name: client.name });
  } catch (err) {
    // Unique-constraint race: two concurrent creates can both pass the findUnique check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "A client with that name already exists." });
      return;
    }
    throw err;
  }
});

// Data mutations only apply to active clients — archived ones keep their history frozen.
// (The UI renders archived clients read-only; this backs that up.)
async function loadActiveClientOr4xx(clientId: string, res: Response) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return null;
  }
  if (client.archivedAt) {
    res.status(409).json({ error: "This client is archived — unarchive it before updating its data." });
    return null;
  }
  return client;
}

// ---------- detail (Client page) ----------
/** How many vulnerabilities the client page shows. The sync caches KnowledgeBase metadata for
 *  more than this (see KB_PER_CLIENT), so raising it needs no re-sync. */
const TOP_VULN_COUNT = 5;

async function loadClientOr404(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      // nulls last so undated legacy rows (from migrated workbooks with no date column) sort to
      // the end, matching the original app's chronological-sort-with-undated-tail behavior
      qualysSnapshots: { orderBy: { date: { sort: "asc", nulls: "last" } } },
      // Ranked by affected assets. The severity/qid tiebreaks aren't decoration: ties on a low
      // asset count are common, and without a deterministic order the "top 5" would reshuffle
      // between page loads for no reason.
      qualysVulns: {
        orderBy: [{ assetCount: "desc" }, { severity: "desc" }, { qid: "asc" }],
        take: TOP_VULN_COUNT,
      },
      ispmControls: { orderBy: { control: "asc" } },
      ispmSnapshots: { orderBy: { date: "asc" } },
      tasks: { orderBy: { createdAt: "asc" }, include: { assignee: { select: { name: true } } } },
    },
  });
  if (!client) return null;
  // QualysVuln has no foreign key to QualysKbEntry on purpose — a QID is counted the moment a scan
  // sees it, which is before its write-up has been fetched — so the join is a second lookup over
  // at most TOP_VULN_COUNT ids rather than a Prisma relation.
  const kbEntries = await prisma.qualysKbEntry.findMany({
    where: { qid: { in: client.qualysVulns.map((v) => v.qid) } },
  });
  return { ...client, kbEntries };
}

function toDetail(client: NonNullable<Awaited<ReturnType<typeof loadClientOr404>>>): ClientDetail {
  const qSeries = client.qualysSnapshots.map(serializeSnapshot);
  const ispm = client.ispmControls.map(serializeIspmControl);
  const tasks = client.tasks.map(serializeTask);
  const latest = qSeries.length ? qSeries[qSeries.length - 1]! : null;
  const goals = goalsOf(client);
  const scores = computeClientScores(latest, qSeries, ispm, client.ispmNotApplicable, goals);
  return {
    id: client.id,
    name: client.name,
    ispmNotApplicable: client.ispmNotApplicable,
    archivedAt: client.archivedAt ? client.archivedAt.toISOString() : null,
    qualys: latest,
    qSeries,
    ispm,
    ispmSeries: client.ispmSnapshots.map(serializeIspmSnapshot),
    tasks,
    topVulns: serializeTopVulns(client.qualysVulns, client.kbEntries),
    openTaskCount: tasks.filter((t) => t.status !== "Done").length,
    lastQualysDate: latest?.date ?? null,
    qualysTag: client.qualysTag,
    qualysLastSyncAt: client.qualysLastSyncAt ? client.qualysLastSyncAt.toISOString() : null,
    qualysSyncError: client.qualysSyncError,
    goals,
    customGoals: hasCustomGoals(client),
    ...scores,
  };
}

clientsRouter.get("/:id", async (req, res) => {
  const client = await loadClientOr404(req.params.id);
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }
  res.json(toDetail(client));
});

// ---------- append a Qualys snapshot (manual backfill; the daily sync writes directly) ----------
// .max keeps values inside Postgres Int range — without it an absurd number (fat-fingered paste)
// would 500 at the Prisma layer instead of 400ing with a useful message.
const count = z.number().min(0).max(100_000_000, "That number is implausibly large — double-check it.").int("Must be a whole number.");
const qualysSchema = z.object({
  date: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  active: count,
  crit: count,
  high: count,
  med: count,
  low: count,
  fix030: count,
  fix3060: count,
  fix6090: count,
  assets: count,
  reboot: count,
});

clientsRouter.post("/:id/qualys", async (req, res) => {
  const parsed = qualysSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid Qualys data." });
    return;
  }
  const client = await loadActiveClientOr4xx(req.params.id, res);
  if (!client) return;
  const { date, ...vals } = parsed.data;
  // One snapshot per client per date: a same-date save replaces rather than appends. This makes
  // retries safe — if a caller's later request fails
  // the user's natural retry would otherwise double-log this scan and permanently kink the
  // trend line the scoring is built on.
  const sameDate = await prisma.qualysSnapshot.findFirst({
    where: { clientId: client.id, date: new Date(date) },
  });
  if (sameDate) {
    await prisma.qualysSnapshot.update({ where: { id: sameDate.id }, data: vals });
  } else {
    await prisma.qualysSnapshot.create({ data: { clientId: client.id, date: new Date(date), ...vals } });
  }
  const full = await loadClientOr404(client.id);
  res.status(201).json(toDetail(full!));
});

// ---------- replace the full ISPM control set (the ISPM tab's inline editor) ----------
const fallback = (def: string) =>
  z
    .string()
    .trim()
    .transform((v) => v || def);
const ispmControlSchema = z.object({
  control: z.string().trim().min(1, "Every control needs a name."),
  category: fallback("Uncategorized"),
  group: fallback("N/A"),
  severity: z.enum(["High", "Medium", "Low"]),
  compliant: z.boolean(),
});
const ispmReplaceSchema = z.object({
  controls: z.array(ispmControlSchema),
  // Optional so callers can replace controls without recording history. The ISPM tab's inline
  // editor always sends today's date, stamping one history point per day.
  date: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Invalid date")
    .optional(),
});

clientsRouter.put("/:id/ispm", async (req, res) => {
  const parsed = ispmReplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ISPM control list." });
    return;
  }
  const client = await loadActiveClientOr4xx(req.params.id, res);
  if (!client) return;
  const { controls, date } = parsed.data;
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.ispmControl.deleteMany({ where: { clientId: client.id } }),
    prisma.ispmControl.createMany({
      data: controls.map((c) => ({ ...c, clientId: client.id })),
    }),
    prisma.client.update({ where: { id: client.id }, data: { ispmNotApplicable: false } }),
  ];
  if (date) {
    // Aggregate history point behind the composite-score trend. Same idiom as the Qualys
    // handler: one snapshot per client per date, a same-date re-save replaces rather than
    // appends, so same-day edits and retries can't kink the trend line.
    const snap = {
      totalCount: controls.length,
      compliantCount: controls.filter((c) => c.compliant).length,
      weightedCompliancePct: ispmWeightedCompliancePct(controls) ?? 0,
    };
    const sameDate = await prisma.ispmSnapshot.findFirst({
      where: { clientId: client.id, date: new Date(date) },
    });
    ops.push(
      sameDate
        ? prisma.ispmSnapshot.update({ where: { id: sameDate.id }, data: snap })
        : prisma.ispmSnapshot.create({ data: { clientId: client.id, date: new Date(date), ...snap } })
    );
  }
  await prisma.$transaction(ops);
  const full = await loadClientOr404(client.id);
  res.json(toDetail(full!));
});

// ---------- admin: per-client posture goals ----------
// null clears the override and returns the client to DEFAULT_CLIENT_GOALS — that's why the fields
// are nullable rather than optional: omitting a key leaves it alone, sending null resets it.
// Bounds come from GOAL_LIMITS so this and normalizeGoals() can't drift apart; both exist because
// a zero vuln target and a 100% ISPM target each divide by zero in the scoring curves.
const L = GOAL_LIMITS;
const goalsSchema = z.object({
  vulnTargetPerAsset: z
    .number()
    .min(L.vulnTargetPerAsset.min, `The vulnerability goal must be at least ${L.vulnTargetPerAsset.min}.`)
    .max(L.vulnTargetPerAsset.max, "That vulnerability goal is implausibly large.")
    .nullable()
    .optional(),
  ispmTargetPct: z
    .number()
    .min(L.ispmTargetPct.min, `The ISPM goal must be at least ${L.ispmTargetPct.min}%.`)
    .max(
      L.ispmTargetPct.max,
      "The ISPM goal must stay below 100% — full compliance is the top of the scale, not the anchor."
    )
    .nullable()
    .optional(),
});

clientsRouter.patch("/:id/goals", requireAdmin, async (req, res) => {
  const parsed = goalsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid posture goals." });
    return;
  }
  // Archived clients are frozen like every other data mutation on this router.
  const client = await loadActiveClientOr4xx(req.params.id, res);
  if (!client) return;

  const data: { vulnTargetPerAsset?: number | null; ispmTargetPct?: number | null } = {};
  if ("vulnTargetPerAsset" in parsed.data) data.vulnTargetPerAsset = parsed.data.vulnTargetPerAsset ?? null;
  if ("ispmTargetPct" in parsed.data) data.ispmTargetPct = parsed.data.ispmTargetPct ?? null;

  await prisma.client.update({ where: { id: client.id }, data });
  audit("client.goals_change", {
    client: client.name,
    before: { vulnTargetPerAsset: client.vulnTargetPerAsset, ispmTargetPct: client.ispmTargetPct },
    after: data,
    by: req.user?.email,
  });
  const full = await loadClientOr404(client.id);
  res.json(toDetail(full!));
});

const ispmNotApplicableSchema = z.object({ value: z.boolean() });

clientsRouter.patch("/:id/ispm-not-applicable", async (req, res) => {
  const parsed = ispmNotApplicableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid value." });
    return;
  }
  const client = await loadActiveClientOr4xx(req.params.id, res);
  if (!client) return;
  await prisma.$transaction([
    prisma.client.update({ where: { id: client.id }, data: { ispmNotApplicable: parsed.data.value } }),
    ...(parsed.data.value ? [prisma.ispmControl.deleteMany({ where: { clientId: client.id } })] : []),
  ]);
  const full = await loadClientOr404(client.id);
  res.json(toDetail(full!));
});
