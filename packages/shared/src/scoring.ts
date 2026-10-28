// Security posture scoring — ported verbatim from the original single-file app
// (index.html:896-1005 in the pre-rebuild version; see legacy/index.html in git history).
// These are pure functions on purpose: the API calls them server-side so every user sees the
// same numbers, and they're unit-tested in scoring.test.ts against known input/output pairs
// before anything else in the app depends on them. Do not "improve" the formulas here without
// updating both the tests and CHANGELOG — they encode deliberate business decisions (targets,
// weights) made when the team started tracking client posture maturity.
//
// The two *targets* (vulns/asset, ISPM compliance %) are no longer baked in: they arrive as a
// ClientGoals argument defaulting to DEFAULT_CLIENT_GOALS, so every existing caller and test keeps
// the original numbers while the API can pass a client's own goals. Realistic targets differ per
// client — a 40-seat legal office and a 900-seat manufacturer aren't held to the same number.
//
// The composite blend stays fixed at 55/45 for everyone on purpose: it's methodology, not a goal.
// Per-client blends would mean two clients' 0-100 scores were computed differently, which would
// quietly make the Overview ranking and portfolio average meaningless.
import type { IspmControl, IspmSeverity, IspmSnapshotSummary, QualysSnapshot } from "./types.js";

const VULN_TARGET_HEALTH = 85; // health score awarded for landing exactly on the vuln target
const VULN_FLOOR_HEALTH = 5; // asymptotic worst-case health for very large backlogs
const VULN_DECAY_SPAN = 20; // vulns/asset beyond target needed to close ~63% of the remaining gap to the floor
const VULN_TREND_WEIGHT = 0.3; // how much trend (improving/worsening) factors into vuln health

const ISPM_TARGET_HEALTH = 85; // health score awarded for landing exactly on the ISPM target
const ISPM_CTRL_WEIGHT: Record<IspmSeverity, number> = { High: 5, Medium: 2, Low: 1 };

const VULN_BLEND_WEIGHT = 0.55; // composite share carried by vuln health — fixed for every client

/**
 * The per-client posture goals an admin can set on the client page. Everything else stays fixed:
 * the curve *shapes* (decay span, trend share, severity weights) and the composite blend are
 * modelling decisions, while these two are the targets the team negotiates per engagement.
 */
export interface ClientGoals {
  /** Avg active vulns/asset considered "on target" — scores 85. */
  vulnTargetPerAsset: number;
  /** Weighted ISPM compliance % considered "on target" — scores 85. */
  ispmTargetPct: number;
}

export const DEFAULT_CLIENT_GOALS: ClientGoals = {
  vulnTargetPerAsset: 10,
  ispmTargetPct: 75,
};

/** Hard bounds, exported so the API's validation messages and the UI's inputs agree with the
 *  clamp below instead of each restating them. */
export const GOAL_LIMITS = {
  vulnTargetPerAsset: { min: 0.1, max: 1000 },
  ispmTargetPct: { min: 1, max: 99 },
} as const;

/**
 * Clamps stored/user-supplied goals into the range the formulas are defined over. This is the
 * single guard for every caller (API, web, tests) rather than a check per call site — and both
 * bounds are load-bearing, not cosmetic: a 0 vuln target divides by zero in vulnTargetHealth, and
 * a 100% ISPM target divides by zero in ispmTargetHealth's upper segment.
 */
export function normalizeGoals(g?: Partial<ClientGoals> | null): ClientGoals {
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const L = GOAL_LIMITS;
  return {
    vulnTargetPerAsset: clamp(
      n(g?.vulnTargetPerAsset, DEFAULT_CLIENT_GOALS.vulnTargetPerAsset),
      L.vulnTargetPerAsset.min,
      L.vulnTargetPerAsset.max
    ),
    ispmTargetPct: clamp(n(g?.ispmTargetPct, DEFAULT_CLIENT_GOALS.ispmTargetPct), L.ispmTargetPct.min, L.ispmTargetPct.max),
  };
}

/** Maps "average active vulns/asset" onto a 0-100 health score, anchored at the target. */
export function vulnTargetHealth(avgPerAsset: number, g: ClientGoals = DEFAULT_CLIENT_GOALS): number {
  const target = g.vulnTargetPerAsset;
  if (avgPerAsset <= 0) return 100;
  if (avgPerAsset <= target) {
    return 100 - (100 - VULN_TARGET_HEALTH) * (avgPerAsset / target);
  }
  const over = avgPerAsset - target;
  return VULN_FLOOR_HEALTH + (VULN_TARGET_HEALTH - VULN_FLOOR_HEALTH) * Math.exp(-over / VULN_DECAY_SPAN);
}

/**
 * Rewards a falling avg-vulns/asset trend across the loaded scan history (first scan vs latest);
 * penalizes a rising one. Returns null when there isn't enough history yet to judge a trend.
 */
export function vulnTrendScore(series: QualysSnapshot[] | null | undefined): number | null {
  const dated = (series || []).filter((r) => r && r.assets);
  if (dated.length < 2) return null;
  const first = dated[0]!;
  const last = dated[dated.length - 1]!;
  const firstAvg = first.active / first.assets;
  const lastAvg = last.active / last.assets;
  const pctDelta = firstAvg > 0 ? (lastAvg - firstAvg) / firstAvg : lastAvg > 0 ? 1 : 0;
  return Math.max(0, Math.min(100, 50 - pctDelta * 100)); // flat = 50; every 1% decrease/increase moves it +/-1
}

export interface VulnTrendInfo {
  pct: number;
  firstAvg: number;
  lastAvg: number;
  scans: number;
}

/** Human-readable version of the same first-scan-vs-latest comparison, for display rather than scoring. */
export function vulnTrendInfo(series: QualysSnapshot[] | null | undefined): VulnTrendInfo | null {
  const dated = (series || []).filter((r) => r && r.assets);
  if (dated.length < 2) return null;
  const first = dated[0]!;
  const last = dated[dated.length - 1]!;
  const firstAvg = first.active / first.assets;
  const lastAvg = last.active / last.assets;
  if (firstAvg <= 0) return null;
  return { pct: ((lastAvg - firstAvg) / firstAvg) * 100, firstAvg, lastAvg, scans: dated.length };
}

export function vulnHealth(
  q: QualysSnapshot | null | undefined,
  series: QualysSnapshot[] | null | undefined,
  g: ClientGoals = DEFAULT_CLIENT_GOALS
): number | null {
  if (!q || !q.assets) return null;
  const target = vulnTargetHealth(q.active / q.assets, g);
  const trend = vulnTrendScore(series);
  const blended = trend == null ? target : target * (1 - VULN_TREND_WEIGHT) + trend * VULN_TREND_WEIGHT;
  return Math.max(0, Math.min(100, blended));
}

/** Maps weighted ISPM compliance % onto a 0-100 health score, anchored at the target (not 100%). */
export function ispmTargetHealth(pct: number, g: ClientGoals = DEFAULT_CLIENT_GOALS): number {
  const target = g.ispmTargetPct;
  if (pct <= 0) return 0;
  if (pct <= target) return (ISPM_TARGET_HEALTH / target) * pct;
  return ISPM_TARGET_HEALTH + ((100 - ISPM_TARGET_HEALTH) / (100 - target)) * (pct - target);
}

/** Unweighted pass rate — simple count of compliant/total. Used for display, not scoring. */
export function rate(rs: { compliant: boolean }[]): { pass: number; fail: number; total: number; pct: number } {
  const pass = rs.filter((r) => r.compliant).length;
  return { pass, fail: rs.length - pass, total: rs.length, pct: rs.length ? Math.round((pass / rs.length) * 100) : 0 };
}

/** Severity-weighted compliance % — a failing High control hurts more than a failing Low one. */
export function ispmWeightedCompliancePct(rs: IspmControl[] | null | undefined): number | null {
  if (!rs || !rs.length) return null;
  let totalW = 0;
  let passW = 0;
  rs.forEach((r) => {
    const w = ISPM_CTRL_WEIGHT[r.severity] || 1;
    totalW += w;
    if (r.compliant) passW += w;
  });
  if (!totalW) return null;
  return (passW / totalW) * 100;
}

export function ispmHealth(
  rs: IspmControl[] | null | undefined,
  g: ClientGoals = DEFAULT_CLIENT_GOALS
): number | null {
  const pct = ispmWeightedCompliancePct(rs);
  return pct == null ? null : ispmTargetHealth(pct, g);
}

export type PctTone = "pass" | "warn" | "fail";

/** Shared color-threshold tone for raw ISPM compliance % displays, anchored at the target. */
export function ispmPctTone(pct: number, g: ClientGoals = DEFAULT_CLIENT_GOALS): PctTone {
  if (pct >= g.ispmTargetPct) return "pass";
  if (pct >= g.ispmTargetPct * 0.6) return "warn";
  return "fail";
}

export function compositeScore(vh: number | null, ih: number | null): number | null {
  if (vh == null && ih == null) return null;
  if (vh == null) return ih;
  if (ih == null) return vh;
  // Fixed blend, not per-client — see the header note on comparability.
  return vh * VULN_BLEND_WEIGHT + ih * (1 - VULN_BLEND_WEIGHT);
}

/** Grade cutoffs, best-first: a score at-or-above `min` earns `grade`. Exported so the UI's
 *  score explainer renders the same scale letterGrade() judges by. */
export const GRADE_CUTOFFS: readonly { grade: string; min: number }[] = [
  { grade: "A", min: 93 },
  { grade: "A-", min: 85 },
  { grade: "B+", min: 78 },
  { grade: "B", min: 72 },
  { grade: "B-", min: 65 },
  { grade: "C+", min: 58 },
  { grade: "C", min: 50 },
  { grade: "C-", min: 42 },
  { grade: "D", min: 35 },
  { grade: "F", min: 0 },
];

export function letterGrade(score: number | null): string {
  if (score == null) return "—";
  return GRADE_CUTOFFS.find((c) => score >= c.min)?.grade ?? "F";
}

export type GradeTone = "pass" | "warn" | "fail" | "neutral";

export function gradeTone(score: number | null): GradeTone {
  if (score == null) return "neutral";
  if (score >= 78) return "pass";
  if (score >= 58) return "warn";
  return "fail";
}

/** Percent change helper for the "since engagement start" narrative strip. */
export function pctChange(from: number, to: number): number | null {
  if (!from) return to ? null : 0;
  return ((to - from) / from) * 100;
}

export interface ClientScores {
  vulnHealth: number | null;
  ispmHealth: number | null;
  compositeScore: number | null;
  grade: string;
  avgVulnsPerAsset: number | null;
  /** Raw (unweighted) ISPM compliance %, for display parity with the old overview cards. */
  ispmCompliancePct: number | null;
}

/** Bundles the full set of derived scores for a client, computed once server-side. */
export function computeClientScores(
  qualys: QualysSnapshot | null | undefined,
  qSeries: QualysSnapshot[] | null | undefined,
  ispm: IspmControl[] | null | undefined,
  ispmNotApplicable: boolean,
  g: ClientGoals = DEFAULT_CLIENT_GOALS
): ClientScores {
  const vh = vulnHealth(qualys, qSeries, g);
  const ih = ispmNotApplicable ? null : ispmHealth(ispm, g);
  const score = compositeScore(vh, ih);
  const avgVulnsPerAsset = qualys && qualys.assets ? qualys.active / qualys.assets : null;
  const ispmCompliancePct = ispmNotApplicable || !ispm?.length ? null : rate(ispm).pct;
  return {
    vulnHealth: vh,
    ispmHealth: ih,
    compositeScore: score,
    grade: letterGrade(score),
    avgVulnsPerAsset,
    ispmCompliancePct,
  };
}

export interface CompositePoint {
  date: string;
  score: number | null;
  grade: string;
}

/**
 * Composite posture score at each dated Qualys snapshot — the series behind the trend chart.
 *
 * The trend MUST end on the same number the live grade card shows, or the two disagree and the
 * "what's my actual score?" question has two answers. The grade blends the client's *current*
 * ISPM controls; ISPM history (snapshots) only starts accumulating once the feature ships, so we
 * can't rely on snapshots alone for the recent end. Since a Weekly Update saves Qualys and ISPM
 * together on one date, the current ISPM state belongs to the latest scan date — so we pin
 * `currentIspmPct` there. Recorded snapshots supply the real past; for dates earlier than any
 * known ISPM point we carry the earliest level *back* (assume it held) rather than dropping to
 * vuln-only, which would put a phantom step in the line where ISPM "turns on."
 *
 * Each point's vulnHealth sees only the series up to that date, so history reflects the trend
 * blend as it stood then. Undated legacy snapshots are excluded (no x-position on a time axis).
 */
export function compositeScoreSeries(
  qSeries: QualysSnapshot[] | null | undefined,
  ispmSeries: IspmSnapshotSummary[] | null | undefined,
  ispmNotApplicable: boolean,
  currentIspmPct?: number | null,
  g: ClientGoals = DEFAULT_CLIENT_GOALS
): CompositePoint[] {
  const dated = (qSeries ?? []).filter((s): s is QualysSnapshot & { date: string } => !!s.date);
  if (!dated.length) return [];

  // Weighted-compliance % by date: recorded snapshots, plus current pinned at the latest scan
  // date (set last so it wins a same-date tie — current is the freshest truth).
  const byDate = new Map<string, number>();
  if (!ispmNotApplicable) {
    for (const s of ispmSeries ?? []) byDate.set(s.date, s.weightedCompliancePct);
    if (currentIspmPct != null) byDate.set(dated[dated.length - 1]!.date, currentIspmPct);
  }
  const ispmDates = [...byDate.keys()].sort();
  // ISPM % effective at date d: latest point at-or-before d; failing that (d precedes all known
  // points) the earliest known point, carried back.
  function ispmPctAt(d: string): number | null {
    if (!ispmDates.length) return null;
    let val: number | null = null;
    for (const dt of ispmDates) {
      if (dt <= d) val = byDate.get(dt)!;
      else break;
    }
    return val ?? byDate.get(ispmDates[0]!)!;
  }

  return dated.map((snap, i) => {
    const vh = vulnHealth(snap, dated.slice(0, i + 1), g);
    const pct = ispmNotApplicable ? null : ispmPctAt(snap.date);
    const ih = pct == null ? null : ispmTargetHealth(pct, g);
    const score = compositeScore(vh, ih);
    // Grade off the precise score (matches GradeCard), but expose a rounded score for plotting
    // and tooltips — a "posture score" reads as a whole number, like the grade card's display.
    return { date: snap.date, score: score == null ? null : Math.round(score), grade: letterGrade(score) };
  });
}
