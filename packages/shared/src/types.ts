// Shared domain types used by both the API (apps/api) and the migration script (scripts/).
// The frontend (apps/web) consumes the same shapes over JSON, so keep these the single source
// of truth for what a "client", "snapshot", "control", and "task" look like on the wire.

import type { ClientGoals } from "./scoring.js";

export type IspmSeverity = "High" | "Medium" | "Low";
export type TaskStatus = "To Do" | "In Progress" | "Done";
export type TaskPriority = "Low" | "Medium" | "High";
export type TaskLinkType = "ispm" | "qualys" | null;
export type UserRole = "ADMIN" | "MEMBER";

// One dated Qualys scan snapshot. Field names match the original workbook's QMAP keys
// (index.html:624-632) so the migration script can map 1:1.
export interface QualysSnapshot {
  id?: string;
  // ISO date (yyyy-mm-dd). Null only for legacy migrated rows whose source sheet had no
  // recognizable date column — new snapshots created via the Weekly Update form always have one.
  date: string | null;
  active: number;
  crit: number;
  high: number;
  med: number;
  low: number;
  fix030: number;
  fix3060: number;
  fix6090: number;
  assets: number;
  reboot: number;
}

// A single ISPM control's current compliance state. ISPM is a point-in-time snapshot,
// not a series — see IspmControl model comment in prisma/schema.prisma.
export interface IspmControl {
  id?: string;
  control: string;
  category: string;
  group: string;
  severity: IspmSeverity;
  compliant: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  note: string;
  priority: TaskPriority;
  dueDate: string | null; // yyyy-mm-dd target date
  assigneeId: string | null;
  assigneeName: string | null; // denormalized for display; null = unassigned
  linkType: TaskLinkType;
  linkRef: string;
  created: string | null; // ISO datetime
  completed: string | null; // ISO datetime
}

/** Minimal user row for assignment dropdowns (GET /user-options — any signed-in user). */
export interface UserOption {
  id: string;
  name: string;
}

/** Grouped results for the Ctrl+K search palette (GET /search?q=). */
export interface SearchResults {
  clients: { id: string; name: string }[];
  tasks: { id: string; title: string; done: boolean; clientId: string; clientName: string }[];
  controls: { id: string; control: string; compliant: boolean; clientId: string; clientName: string }[];
}

export interface ClientSummary {
  id: string;
  name: string;
  ispmNotApplicable: boolean;
  archivedAt: string | null;
  vulnHealth: number | null;
  ispmHealth: number | null;
  compositeScore: number | null;
  grade: string;
  avgVulnsPerAsset: number | null;
  ispmCompliancePct: number | null;
  openTaskCount: number;
  /** Latest Qualys snapshot scan date (yyyy-mm-dd), for staleness display on the Overview. */
  lastQualysDate: string | null;
  /** Asset tag identifying this client in Qualys; null = not auto-synced. */
  qualysTag: string | null;
  qualysLastSyncAt: string | null; // ISO datetime of the last sync attempt
  qualysSyncError: string | null; // last sync failure message; null = OK or never synced
  /** Posture goals this client was actually scored against — the client's own values where set,
   *  otherwise DEFAULT_CLIENT_GOALS. Always resolved, so display code can print a target without
   *  re-deriving the fallback. */
  goals: ClientGoals;
  /** True when an admin has set at least one goal for this client rather than inheriting the
   *  default. Drives the "custom" badge and the reset-to-default affordance. */
  customGoals: boolean;
}

/** Per-client outcome of a Qualys sync run (returned by POST /clients/sync-qualys). */
export interface QualysSyncResult {
  clientId: string;
  name: string;
  ok: boolean;
  error?: string;
}

/** Daily Qualys sync schedule (GET/PUT /clients/sync-schedule). */
export interface QualysSyncSchedule {
  enabled: boolean;
  /** 24h "HH:MM" in `tz` */
  time: string;
  tz: string;
  /** false when the server has no Qualys credentials — the schedule is inert */
  configured: boolean;
}

/** Aggregate ISPM state recorded at a Weekly Update — one point in the compliance time series
 *  behind the composite-score trend. Unlike IspmControl (current state, replaced wholesale),
 *  these are append-only history. */
export interface IspmSnapshotSummary {
  date: string; // ISO date (yyyy-mm-dd)
  totalCount: number;
  compliantCount: number;
  weightedCompliancePct: number;
}

/** One row of the Top vulnerabilities table — a per-QID count from the latest sync, joined to the
 *  cached KnowledgeBase metadata where it exists. */
export interface TopVuln {
  qid: string;
  severity: number; // 1-5 as Qualys reports it
  /** Distinct assets affected — the ranking key. */
  assetCount: number;
  /** Detection rows; matches Qualys's own VULNERABILITY COUNT column. */
  detectionCount: number;
  /** null when the KnowledgeBase entry hasn't been cached yet (new QID, or a KB outage). The
   *  table still renders the row with a bare QID — the counts are useful without the write-up. */
  title: string | null;
  patchable: boolean | null;
  cves: string[];
}

/** The full KnowledgeBase write-up for one QID (GET /qualys-kb/:qid). Fetched only when the detail
 *  modal opens — the prose fields run to several KB each and would otherwise ride on every
 *  ClientDetail response, which is re-sent on every client-page mutation. */
export interface QualysKbDetail extends TopVuln {
  /** Narrower than TopVuln's: the detail endpoint returns a blank entry rather than 404ing for an
   *  unnamed QID, so there's always a string here — "" means nobody has named it yet. */
  title: string;
  category: string;
  diagnosis: string;
  consequence: string;
  solution: string;
  /** Watchtower-authored context. Survives a KnowledgeBase refresh; the Qualys fields above don't. */
  notes: string;
  /** True when Qualys's KnowledgeBase API populated this entry. False means it was named by hand —
   *  which is the normal case while the subscription lacks the KnowledgeBase entitlement. */
  fromQualys: boolean;
}

export interface ClientDetail extends ClientSummary {
  qualys: QualysSnapshot | null; // latest snapshot
  qSeries: QualysSnapshot[]; // full chronological series
  ispm: IspmControl[];
  ispmSeries: IspmSnapshotSummary[]; // chronological aggregate history (starts at feature ship)
  tasks: Task[];
  /** Highest-impact vulnerabilities from the latest sync, most-affected-assets first. Empty for
   *  clients that have never synced (manual/legacy Qualys data carries no per-QID detail). */
  topVulns: TopVuln[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // True while the account still has an admin-issued temporary password; the UI forces a
  // password change before anything else.
  mustChangePassword: boolean;
  // Whether TOTP multi-factor auth is active on the account.
  mfaEnabled: boolean;
  // Admin waiver from the mandatory-enrollment gate (test/demo accounts). The account can still
  // enroll voluntarily; if it does, the second factor still applies at sign-in.
  mfaExempt: boolean;
  // Minutes a browser stays trusted after an MFA check before being prompted again (0 = always,
  // capped at 60 by the API).
  mfaGraceMinutes: number;
  // ISO datetime of the most recent successful sign-in; null = never signed in. Stamped by
  // finalizeLogin, shown in the Admin > Users table.
  lastLoginAt?: string | null;
  // ISO datetime until which the account is brute-force locked; null/past = not locked.
  // Only present on the admin users list (not /auth/me).
  lockedUntil?: string | null;
}

/** One persisted security audit event (GET /audit-events, admin only). */
export interface AuthEventRow {
  id: string;
  event: string;
  userId: string | null;
  email: string | null;
  ip: string | null;
  /** JSON string of any extra event fields — display-only. */
  detail: string | null;
  createdAt: string; // ISO datetime
}

/** One scan of one client — the flat shape behind the Overview's "Export history" CSV. */
export interface HistoryRow {
  client: string;
  date: string;
  active: number;
  crit: number;
  high: number;
  med: number;
  low: number;
  assets: number;
  vulnsPerAsset: number | null;
  score: number | null;
  grade: string;
  ispmCompliancePct: number | null;
}
