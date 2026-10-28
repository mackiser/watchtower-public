import type { NextFunction, Request, Response } from "express";
import { audit } from "./audit.js";
import { prisma } from "./prisma.js";

// Demo-only. The public demo (DEMO_SEED=1) has no Qualys
// credentials, so the real daily sync in qualysSync.ts is permanently disabled there (see the
// qualysConfigured() gate in applySchedule). Without it, every demo client's "latest scan" date
// freezes at whatever day seedDemo.ts ran, and the Overview page's staleness badge (>21 days =
// "stale") lights up across the whole fleet within three weeks of any deploy — which defeats the
// point of a proof-of-concept a prospect gets walked through.
//
// This does the same job as a real sync without calling Qualys: at most once a day, on the first
// signed-in request of that day (no scheduler needed, so it works on serverless hosts that have
// none), it appends one more QualysSnapshot per non-archived
// client, continuing that client's own existing trend rather than re-deriving from seedDemo.ts's
// per-client tuning knobs — so it keeps working even if a demo client gets renamed or the seed
// data changes shape later. The one archived demo client (Meridian, "churned client kept for
// history") is deliberately excluded — its data should stay frozen in the past.

/** Deterministic per (client, day) wobble in [-amplitude, amplitude] — mulberry32 seeded by a
 *  cheap string hash. Not cryptographic; just needs to not look like a straight line, and to be
 *  the same number if this ever runs twice for the same client on the same day. */
export function seededJitter(key: string, amplitude: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  let t = (h >>> 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
  return (unit * 2 - 1) * amplitude;
}

function todayUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function runDemoFakeSync(): Promise<void> {
  const clients = await prisma.client.findMany({ where: { archivedAt: null }, select: { id: true } });
  const today = todayUtcMidnight();
  let touched = 0;

  for (const client of clients) {
    const latest = await prisma.qualysSnapshot.findFirst({
      where: { clientId: client.id, date: { not: null } },
      orderBy: { date: "desc" },
    });
    // No demo Qualys history for this client, or already synced today — nothing to do.
    if (!latest?.date || new Date(latest.date).getTime() === today.getTime()) continue;

    // Hold roughly steady around the latest real numbers with a small wobble, rather than
    // trending forever in one direction — a real fleet plateaus once remediation catches up.
    const jitter = 1 + seededJitter(`${client.id}:${today.toISOString().slice(0, 10)}`, 0.06);
    const active = Math.max(0, Math.round(latest.active * jitter));
    // Scale the rest by the same ratio so the severity split and fix-age mix stay consistent
    // with whatever history is already in the database, instead of re-deriving them.
    const scale = latest.active ? active / latest.active : 1;
    const scaled = (n: number) => Math.max(0, Math.round(n * scale));
    const crit = scaled(latest.crit);
    const high = scaled(latest.high);
    const med = scaled(latest.med);

    await prisma.qualysSnapshot.create({
      data: {
        clientId: client.id,
        date: today,
        active,
        crit,
        high,
        med,
        low: Math.max(0, active - crit - high - med),
        fix030: scaled(latest.fix030),
        fix3060: scaled(latest.fix3060),
        fix6090: scaled(latest.fix6090),
        assets: latest.assets,
        reboot: latest.reboot,
      },
    });
    await prisma.client.update({
      where: { id: client.id },
      data: { qualysLastSyncAt: new Date(), qualysSyncError: null },
    });
    touched++;
  }

  if (touched > 0) {
    audit("demo.fake_sync", { touched });
    console.log(`Demo fake sync: refreshed ${touched} client(s).`);
  }
}

let checkedDay = "";
let inflight: Promise<void> | null = null;

/** Runs the (idempotent) fake sync at most once per UTC day per process. Concurrent callers share
 *  one run; a failed run isn't remembered, so the next request retries. */
export function ensureFreshDemoData(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  if (checkedDay === day) return Promise.resolve();
  inflight ??= runDemoFakeSync()
    .then(() => {
      checkedDay = day;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Express middleware: before a signed-in GET of client data in demo mode, make sure today's
 *  snapshot exists. A sync failure must never fail the page, so it only logs. */
export function demoFreshness(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.DEMO_SEED !== "1" || req.method !== "GET") return next();
  ensureFreshDemoData().then(
    () => next(),
    (err) => {
      console.error("demo fake sync:", err);
      next();
    }
  );
}
