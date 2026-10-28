import type { QualysSyncResult, QualysSyncSchedule } from "@watchtower/shared";
import cron, { type ScheduledTask } from "node-cron";
import { audit } from "./audit.js";
import { MAX_PAGES, parser, QUALYS_BASE, qualysConfigured, qualysGet } from "./qualysApi.js";
import { prisma } from "./prisma.js";
import { refreshKbEntriesSafely } from "./qualysKb.js";

export { qualysConfigured };

// Daily Qualys VM sync. For each client with a qualysTag we pull open + recently-fixed
// detections and the host inventory for that tag, aggregate them into the same QualysSnapshot
// row shape the manual Weekly Update wrote, and upsert one snapshot per client per ET calendar
// day. Scoring/charts are untouched — they read QualysSnapshot exactly as before.
//
// Env (read at point of use, matching lib/session.ts convention). Sync is disabled entirely
// when the credentials are unset, so deploys without Qualys access still boot.

// Qualys versions its API paths now (2.0 is EOS as of mid-2026, EOL ~Dec 2026); 5.0 is current.
const API_VERSION = "5.0";
const SYNC_TZ = () => process.env.QUALYS_SYNC_TZ || "America/New_York";

// How Qualys severity levels (1-5) map onto the dashboard's buckets. Confirmed with the team:
// 5 = Critical, 4 = High, 3 = Medium, 1-2 = Low. Adjust here if synced numbers don't match
// what was being read off the Qualys UI.
export const SEVERITY_BUCKET: Record<number, "crit" | "high" | "med" | "low"> = {
  5: "crit",
  4: "high",
  3: "med",
  2: "low",
  1: "low",
};

// QID 90126 = "reboot required" — a Potential/sev-3 detection Qualys raises per host pending
// reboot. It rides along in the normal open-detections fetch; we count distinct hosts with it.
const REBOOT_QID = "90126";

export interface ParsedDetection {
  qid: string;
  /** Qualys detection type — "Confirmed" | "Potential". Only Confirmed detections count toward
   *  the vulnerability metrics, matching the Qualys dashboard's headline numbers (verified with
   *  the team against the AdamsFunds tag: dashboard 1,908 = Confirmed only). */
  type: string;
  severity: number;
  status: string;
  lastFixed?: string; // LAST_FIXED_DATETIME, ISO
}
export interface ParsedHost {
  hostId: string;
  detections: ParsedDetection[];
}


/** Parse one page of Host List Detection XML → hosts with detections + next-page URL (if truncated). */
export function parseDetectionXml(xml: string): { hosts: ParsedHost[]; nextUrl: string | null } {
  const doc = parser.parse(xml);
  const resp = doc?.HOST_LIST_VM_DETECTION_OUTPUT?.RESPONSE;
  const rawHosts: any[] = resp?.HOST_LIST?.HOST ?? [];
  const hosts: ParsedHost[] = rawHosts.map((h) => {
    const rawDets: any[] = h?.DETECTION_LIST?.DETECTION ?? [];
    return {
      hostId: String(Array.isArray(h.ID) ? h.ID[0] : h.ID),
      detections: rawDets.map((d) => ({
        qid: String(d.QID ?? ""),
        type: String(d.TYPE ?? ""),
        severity: Number(d.SEVERITY) || 0,
        status: String(d.STATUS ?? ""),
        lastFixed: d.LAST_FIXED_DATETIME ? String(d.LAST_FIXED_DATETIME) : undefined,
      })),
    };
  });
  return { hosts, nextUrl: resp?.WARNING?.URL ? String(resp.WARNING.URL) : null };
}

/** Parse one page of Host List XML (details=None) → host count + next-page URL.
 *  With details=None the response is an <ID_SET> of <ID> and <ID_RANGE min-max> elements,
 *  not a <HOST_LIST> (verified against the live 5.0 API). */
export function parseHostListXml(xml: string): { count: number; nextUrl: string | null } {
  const doc = parser.parse(xml);
  const resp = doc?.HOST_LIST_OUTPUT?.RESPONSE;
  const ids: any[] = resp?.ID_SET?.ID ?? [];
  const ranges: any[] = resp?.ID_SET?.ID_RANGE ?? [];
  let count = ids.length;
  for (const r of ranges) {
    const [min, max] = String(r).split("-").map(Number);
    if (min != null && max != null && !isNaN(min) && !isNaN(max)) count += max - min + 1;
  }
  return { count, nextUrl: resp?.WARNING?.URL ? String(resp.WARNING.URL) : null };
}

export type SnapshotFields = {
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
};

/** Aggregate open + fixed detections into the QualysSnapshot numeric fields (minus assets). */
export function aggregateSnapshot(open: ParsedHost[], fixed: ParsedHost[], now: Date): Omit<SnapshotFields, "assets"> {
  const out = { active: 0, crit: 0, high: 0, med: 0, low: 0, fix030: 0, fix3060: 0, fix6090: 0, reboot: 0 };
  for (const host of open) {
    for (const d of host.detections) {
      // Vulnerability metrics count Confirmed detections only — the dashboard's headline number.
      // Potential detections still arrive in the fetch (the reboot QID below is one of them).
      if (d.type !== "Confirmed") continue;
      out.active++;
      const bucket = SEVERITY_BUCKET[d.severity];
      if (bucket) out[bucket]++;
    }
    // reboot = count of hosts (not detections) currently flagged as pending reboot; the reboot
    // QID is Potential-type, so this check deliberately ignores the Confirmed-only rule.
    if (host.detections.some((d) => d.qid === REBOOT_QID)) out.reboot++;
  }
  const DAY = 86_400_000;
  for (const host of fixed) {
    for (const d of host.detections) {
      if (d.type !== "Confirmed") continue;
      if (!d.lastFixed) continue;
      const fixedAt = Date.parse(d.lastFixed);
      if (isNaN(fixedAt)) continue;
      const age = (now.getTime() - fixedAt) / DAY;
      if (age < 0) continue;
      if (age <= 30) out.fix030++;
      else if (age <= 60) out.fix3060++;
      else if (age <= 90) out.fix6090++;
    }
  }
  return out;
}

export interface VulnCount {
  qid: string;
  severity: number;
  /** Distinct hosts carrying this QID — the ranking key for the Top vulnerabilities table. */
  assetCount: number;
  /** Detection rows, which is what Qualys's own VULNERABILITY COUNT column shows. Exceeds
   *  assetCount when one QID is found on several ports of the same host. */
  detectionCount: number;
}

/**
 * Tally the same open-detection rows aggregateSnapshot() counts, but per QID instead of into
 * totals — the data behind the Top vulnerabilities table.
 *
 * Applies the identical `type === "Confirmed"` filter, deliberately: if the rows in that table
 * didn't sum to the "Active vulnerabilities" KPI directly above it, the whole feature would look
 * broken. (That filter is the subject of 93fcdc3 — it's the difference between matching the
 * Qualys dashboard and not.) A consequence is that the reboot QID never appears here, since it's
 * Potential-type; that's correct, it has its own KPI card, and the special case in
 * aggregateSnapshot is deliberately NOT replicated.
 *
 * Severity is taken from the first Confirmed row seen for a QID — Qualys reports one severity per
 * QID, so any row will do.
 */
export function aggregateVulns(open: ParsedHost[]): VulnCount[] {
  const byQid = new Map<string, { severity: number; hosts: Set<string>; detectionCount: number }>();
  for (const host of open) {
    for (const d of host.detections) {
      if (d.type !== "Confirmed") continue;
      let row = byQid.get(d.qid);
      if (!row) {
        row = { severity: d.severity, hosts: new Set(), detectionCount: 0 };
        byQid.set(d.qid, row);
      }
      row.hosts.add(host.hostId);
      row.detectionCount++;
    }
  }
  return [...byQid.entries()].map(([qid, r]) => ({
    qid,
    severity: r.severity,
    assetCount: r.hosts.size,
    detectionCount: r.detectionCount,
  }));
}

/** Calendar date (yyyy-mm-dd) in the sync timezone — snapshot dates use the ET day so a manual
 *  entry and a sync on the same day dedupe to one row, same as the Weekly Update's date field. */
export function etDateString(d: Date, tz = SYNC_TZ()): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}


async function fetchDetections(tag: string, params: Record<string, string>): Promise<ParsedHost[]> {
  let url =
    `${QUALYS_BASE()}/api/${API_VERSION}/fo/asset/host/vm/detection/?action=list&use_tags=1&tag_set_by=name` +
    `&tag_set_include=${encodeURIComponent(tag)}&show_results=0&truncation_limit=1000` +
    Object.entries(params)
      .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
      .join("");
  const all: ParsedHost[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { hosts, nextUrl } = parseDetectionXml(await qualysGet(url));
    all.push(...hosts);
    if (!nextUrl) return all;
    url = nextUrl;
  }
  throw new Error(`Pagination exceeded ${MAX_PAGES} pages — refusing to sync a runaway result set.`);
}

async function fetchHostCount(tag: string): Promise<number> {
  let url =
    `${QUALYS_BASE()}/api/${API_VERSION}/fo/asset/host/?action=list&use_tags=1&tag_set_by=name` +
    `&tag_set_include=${encodeURIComponent(tag)}&details=None&truncation_limit=1000`;
  let count = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const parsed = parseHostListXml(await qualysGet(url));
    count += parsed.count;
    if (!parsed.nextUrl) return count;
    url = parsed.nextUrl;
  }
  throw new Error(`Pagination exceeded ${MAX_PAGES} pages — refusing to sync a runaway result set.`);
}

export type SyncResult = QualysSyncResult;

/** Sync one client. Never throws — failures land in the result and on Client.qualysSyncError. */
async function syncClient(client: { id: string; name: string; qualysTag: string }): Promise<SyncResult> {
  try {
    const now = new Date();
    const assets = await fetchHostCount(client.qualysTag);
    if (assets === 0) {
      // A tag matching zero hosts is almost certainly a typo'd tag, not a client with no
      // machines — recording a zero snapshot would silently crater their trend line.
      throw new Error(`Tag "${client.qualysTag}" matched no assets in Qualys — check the tag name.`);
    }
    const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    const open = await fetchDetections(client.qualysTag, { status: "Active,Re-Opened,New", severities: "1-5" });
    const fixed = await fetchDetections(client.qualysTag, { status: "Fixed", detection_updated_since: since });
    const vals = { ...aggregateSnapshot(open, fixed, now), assets };

    // One snapshot per client per (ET) date — same replace-not-append idiom as POST /:id/qualys,
    // so re-runs and manual entries on the same day can't double-log a scan.
    const date = new Date(etDateString(now));
    const sameDate = await prisma.qualysSnapshot.findFirst({ where: { clientId: client.id, date } });
    if (sameDate) {
      await prisma.qualysSnapshot.update({ where: { id: sameDate.id }, data: vals });
    } else {
      await prisma.qualysSnapshot.create({ data: { clientId: client.id, date, ...vals } });
    }

    // Per-QID counts behind the Top vulnerabilities table — current state, replaced wholesale
    // (the IspmControl idiom). One transaction so a client is never left with a half-written set.
    const vulns = aggregateVulns(open);
    await prisma.$transaction([
      prisma.qualysVuln.deleteMany({ where: { clientId: client.id } }),
      prisma.qualysVuln.createMany({ data: vulns.map((v) => ({ clientId: client.id, ...v })) }),
    ]);
    await prisma.client.update({
      where: { id: client.id },
      data: { qualysLastSyncAt: now, qualysSyncError: null },
    });
    return { clientId: client.id, name: client.name, ok: true };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await prisma.client
      .update({ where: { id: client.id }, data: { qualysLastSyncAt: new Date(), qualysSyncError: message } })
      .catch(() => {}); // status write is best-effort; the audit line below still records it
    audit("qualys.sync_error", { clientId: client.id, name: client.name, error: message });
    return { clientId: client.id, name: client.name, ok: false, error: message };
  }
}

// ---------- daily schedule (admin-editable, persisted in Setting KV) ----------
// Defaults preserve the original behavior: enabled, 17:00 in QUALYS_SYNC_TZ. Pausing keeps the
// settings and just stops the cron task; rescheduling replaces it.

const SYNC_ENABLED_KEY = "qualysSyncEnabled";
const SYNC_TIME_KEY = "qualysSyncTime";
const DEFAULT_SYNC_TIME = "17:00";

let task: ScheduledTask | null = null;

export async function getSyncSchedule(): Promise<QualysSyncSchedule> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [SYNC_ENABLED_KEY, SYNC_TIME_KEY] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: map.get(SYNC_ENABLED_KEY) !== "0",
    time: map.get(SYNC_TIME_KEY) ?? DEFAULT_SYNC_TIME,
    tz: SYNC_TZ(),
    configured: qualysConfigured(),
  };
}

function applySchedule(s: { enabled: boolean; time: string }): void {
  task?.stop();
  task = null;
  if (!qualysConfigured()) {
    console.log("Qualys sync disabled — QUALYS_USERNAME/QUALYS_PASSWORD not set.");
    return;
  }
  if (!s.enabled) {
    console.log("Qualys sync paused by admin setting.");
    return;
  }
  const [h, m] = s.time.split(":").map(Number);
  task = cron.schedule(
    `${m} ${h} * * *`,
    () => {
      syncAllClients().catch((err) => console.error("qualys sync:", err));
    },
    { timezone: SYNC_TZ() }
  );
  console.log(`Qualys sync scheduled daily at ${s.time} ${SYNC_TZ()}.`);
}

const upsertSetting = (key: string, value: string) =>
  prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

export async function setSyncSchedule(input: { enabled: boolean; time: string }): Promise<QualysSyncSchedule> {
  await prisma.$transaction([
    upsertSetting(SYNC_ENABLED_KEY, input.enabled ? "1" : "0"),
    upsertSetting(SYNC_TIME_KEY, input.time),
  ]);
  applySchedule(input);
  return getSyncSchedule();
}

/** Called once at boot: schedule from persisted settings (or defaults). */
export async function initSyncSchedule(): Promise<void> {
  applySchedule(await getSyncSchedule());
}

// Overlap guard: the daily cron and an admin "Sync now" must not interleave — Qualys enforces
// per-user concurrency limits, and sequential is the polite (and simple) mode anyway.
let running = false;
export function syncRunning(): boolean {
  return running;
}

/** Sync all active tagged clients (or just one). Sequential; one client's failure is isolated. */
export async function syncAllClients(clientId?: string): Promise<SyncResult[]> {
  if (running) throw new Error("A Qualys sync is already running.");
  running = true;
  const started = Date.now();
  try {
    const clients = await prisma.client.findMany({
      where: { archivedAt: null, qualysTag: { not: null }, ...(clientId ? { id: clientId } : {}) },
      select: { id: true, name: true, qualysTag: true },
      orderBy: { name: "asc" },
    });
    const results: SyncResult[] = [];
    for (const c of clients) {
      results.push(await syncClient(c as { id: string; name: string; qualysTag: string }));
    }
    // Top up KnowledgeBase metadata once for the whole run, after the counts are committed. The
    // QID sets overlap heavily across clients, so deduping here turns up to 43 lookups into one
    // or two. Never throws — see refreshKbEntriesSafely.
    await refreshKbEntriesSafely();
    audit("qualys.sync", {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      ms: Date.now() - started,
    });
    return results;
  } finally {
    running = false;
  }
}
