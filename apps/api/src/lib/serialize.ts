import type {
  IspmControl as DbIspmControl,
  IspmSnapshot as DbIspmSnapshot,
  QualysKbEntry as DbKbEntry,
  QualysSnapshot as DbSnapshot,
  QualysVuln as DbVuln,
  Task as DbTask,
  TaskLinkType as DbLinkType,
  TaskPriority as DbTaskPriority,
  TaskStatus as DbTaskStatus,
} from "../../prisma/generated/index.js";
import type {
  IspmControl,
  IspmSnapshotSummary,
  QualysKbDetail,
  QualysSnapshot,
  Task,
  TaskLinkType,
  TaskPriority,
  TaskStatus,
  TopVuln,
} from "@watchtower/shared";

const STATUS_TO_SHARED: Record<DbTaskStatus, TaskStatus> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};
const STATUS_TO_DB: Record<TaskStatus, DbTaskStatus> = {
  "To Do": "TODO",
  "In Progress": "IN_PROGRESS",
  Done: "DONE",
};
const LINK_TO_SHARED: Record<DbLinkType, NonNullable<TaskLinkType>> = { ISPM: "ispm", QUALYS: "qualys" };
const LINK_TO_DB: Record<NonNullable<TaskLinkType>, DbLinkType> = { ispm: "ISPM", qualys: "QUALYS" };
const PRIORITY_TO_SHARED: Record<DbTaskPriority, TaskPriority> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
const PRIORITY_TO_DB: Record<TaskPriority, DbTaskPriority> = { Low: "LOW", Medium: "MEDIUM", High: "HIGH" };

export function serializeSnapshot(s: DbSnapshot): QualysSnapshot {
  return {
    id: s.id,
    date: s.date ? s.date.toISOString().slice(0, 10) : null,
    active: s.active,
    crit: s.crit,
    high: s.high,
    med: s.med,
    low: s.low,
    fix030: s.fix030,
    fix3060: s.fix3060,
    fix6090: s.fix6090,
    assets: s.assets,
    reboot: s.reboot,
  };
}

/** Split the stored comma-joined CVE list back into an array. "" → []. */
const splitCves = (cves: string): string[] => cves.split(",").map((c) => c.trim()).filter(Boolean);

/**
 * Join per-QID counts to their cached KnowledgeBase entries.
 *
 * A missing entry is a normal state, not an error: a QID is counted the moment a scan sees it,
 * which is before the KB fetch has run for it (and the fetch is allowed to fail without failing
 * the sync). Those rows come back with `title: null` and render as a bare QID.
 */
export function serializeTopVulns(vulns: DbVuln[], kbEntries: DbKbEntry[]): TopVuln[] {
  const kb = new Map(kbEntries.map((e) => [e.qid, e]));
  return vulns.map((v) => {
    const entry = kb.get(v.qid);
    return {
      qid: v.qid,
      severity: v.severity,
      assetCount: v.assetCount,
      detectionCount: v.detectionCount,
      title: entry?.title ?? null,
      patchable: entry?.patchable ?? null,
      cves: entry ? splitCves(entry.cves) : [],
    };
  });
}

/** The full write-up for the detail modal — everything in TopVuln plus the prose fields. */
export function serializeKbDetail(v: DbVuln | null, entry: DbKbEntry): QualysKbDetail {
  return {
    qid: entry.qid,
    // The detection rows are the authority on severity — a hand-created entry has none.
    severity: v?.severity ?? entry.severity,
    assetCount: v?.assetCount ?? 0,
    detectionCount: v?.detectionCount ?? 0,
    title: entry.title,
    patchable: entry.patchable,
    cves: splitCves(entry.cves),
    category: entry.category,
    diagnosis: entry.diagnosis,
    consequence: entry.consequence,
    solution: entry.solution,
    notes: entry.notes,
    fromQualys: entry.fromQualys,
  };
}

export function serializeIspmControl(c: DbIspmControl): IspmControl {
  return {
    id: c.id,
    control: c.control,
    category: c.category,
    group: c.group,
    severity: c.severity,
    compliant: c.compliant,
  };
}

export function serializeIspmSnapshot(s: DbIspmSnapshot): IspmSnapshotSummary {
  return {
    date: s.date.toISOString().slice(0, 10),
    totalCount: s.totalCount,
    compliantCount: s.compliantCount,
    weightedCompliancePct: s.weightedCompliancePct,
  };
}

export function serializeTask(t: DbTask & { assignee?: { name: string } | null }): Task {
  return {
    id: t.id,
    title: t.title,
    status: STATUS_TO_SHARED[t.status],
    note: t.note,
    priority: PRIORITY_TO_SHARED[t.priority],
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    linkType: t.linkType ? LINK_TO_SHARED[t.linkType] : null,
    linkRef: t.linkRef,
    created: t.createdAt.toISOString(),
    completed: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

export function taskStatusToDb(s: TaskStatus): DbTaskStatus {
  return STATUS_TO_DB[s];
}

export function taskPriorityToDb(p: TaskPriority): DbTaskPriority {
  return PRIORITY_TO_DB[p];
}

export function linkTypeToDb(t: TaskLinkType): DbLinkType | null {
  return t ? LINK_TO_DB[t] : null;
}
