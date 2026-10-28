import { describe, expect, it } from "vitest";
import {
  compositeScore,
  compositeScoreSeries,
  computeClientScores,
  DEFAULT_CLIENT_GOALS,
  ispmHealth,
  ispmTargetHealth,
  ispmWeightedCompliancePct,
  letterGrade,
  normalizeGoals,
  rate,
  vulnHealth,
  vulnTargetHealth,
  vulnTrendScore,
} from "./scoring.js";
import type { IspmControl, IspmSnapshotSummary, QualysSnapshot } from "./types.js";

function snap(overrides: Partial<QualysSnapshot> = {}): QualysSnapshot {
  return {
    date: "2026-01-01",
    active: 0,
    crit: 0,
    high: 0,
    med: 0,
    low: 0,
    fix030: 0,
    fix3060: 0,
    fix6090: 0,
    assets: 0,
    reboot: 0,
    ...overrides,
  };
}

describe("vulnTargetHealth", () => {
  it("is 100 at zero vulns/asset", () => {
    expect(vulnTargetHealth(0)).toBe(100);
  });
  it("is exactly 85 at the target (10 vulns/asset)", () => {
    expect(vulnTargetHealth(10)).toBeCloseTo(85, 5);
  });
  it("decays toward the floor beyond the target", () => {
    // over=10, floor=5, span=20 -> 5 + 80*exp(-0.5)
    expect(vulnTargetHealth(20)).toBeCloseTo(5 + 80 * Math.exp(-0.5), 5);
  });
  it("never drops below the floor for large backlogs", () => {
    // moderately large rather than astronomically large — exp() underflows to exactly 0 well
    // before 100000, which would make this "greater than the floor" check spuriously fail
    expect(vulnTargetHealth(200)).toBeGreaterThan(5);
    expect(vulnTargetHealth(200)).toBeLessThan(6);
  });
  it("asymptotically approaches but never reaches the floor", () => {
    expect(vulnTargetHealth(1e9)).toBe(5);
  });
});

describe("vulnTrendScore", () => {
  it("returns null with fewer than two dated scans", () => {
    expect(vulnTrendScore([snap({ assets: 10, active: 50 })])).toBeNull();
  });
  it("is 50 (flat) when avg/asset hasn't changed", () => {
    const series = [snap({ assets: 10, active: 50 }), snap({ assets: 10, active: 50 })];
    expect(vulnTrendScore(series)).toBe(50);
  });
  it("rewards a falling avg/asset trend (>50)", () => {
    const series = [snap({ assets: 10, active: 100 }), snap({ assets: 10, active: 50 })];
    expect(vulnTrendScore(series)!).toBeGreaterThan(50);
  });
  it("penalizes a rising avg/asset trend (<50)", () => {
    const series = [snap({ assets: 10, active: 50 }), snap({ assets: 10, active: 100 })];
    expect(vulnTrendScore(series)!).toBeLessThan(50);
  });
});

describe("vulnHealth", () => {
  it("returns null with no assets", () => {
    expect(vulnHealth(snap({ assets: 0 }), [])).toBeNull();
  });
  it("matches vulnTargetHealth exactly with no trend history", () => {
    const q = snap({ assets: 10, active: 100 });
    expect(vulnHealth(q, [q])).toBeCloseTo(vulnTargetHealth(10), 5);
  });
});

describe("ISPM scoring", () => {
  const controls: IspmControl[] = [
    { control: "MFA everywhere", category: "Entra", group: "Foundational", severity: "High", compliant: true },
    { control: "Legacy auth blocked", category: "Entra", group: "Foundational", severity: "High", compliant: false },
    { control: "LAPS deployed", category: "Entra", group: "Foundational", severity: "Low", compliant: false },
  ];

  it("rate() is a simple unweighted pass rate", () => {
    expect(rate(controls)).toEqual({ pass: 1, fail: 2, total: 3, pct: 33 });
  });

  it("ispmWeightedCompliancePct weights High failures more than Low ones", () => {
    // weights: High=5, High=5, Low=1 -> total=11, passW=5 -> 45.45%
    expect(ispmWeightedCompliancePct(controls)!).toBeCloseTo((5 / 11) * 100, 5);
  });

  it("ispmTargetHealth is exactly 85 at the 75% target", () => {
    expect(ispmTargetHealth(75)).toBeCloseTo(85, 5);
  });
  it("ispmTargetHealth reaches 100 at 100% compliance", () => {
    expect(ispmTargetHealth(100)).toBeCloseTo(100, 5);
  });

  it("ispmHealth is null with no controls loaded", () => {
    expect(ispmHealth([])).toBeNull();
  });
});

describe("compositeScore", () => {
  it("blends vuln health 55% / ISPM health 45%", () => {
    expect(compositeScore(80, 90)).toBeCloseTo(80 * 0.55 + 90 * 0.45, 5);
  });
  it("falls back to whichever score is available", () => {
    expect(compositeScore(80, null)).toBe(80);
    expect(compositeScore(null, 90)).toBe(90);
    expect(compositeScore(null, null)).toBeNull();
  });
});

describe("letterGrade", () => {
  it.each([
    [95, "A"],
    [93, "A"],
    [92.9, "A-"],
    [85, "A-"],
    [78, "B+"],
    [72, "B"],
    [58, "C+"],
    [50, "C"],
    [42, "C-"],
    [35, "D"],
    [10, "F"],
  ])("scores %d as %s", (score, grade) => {
    expect(letterGrade(score)).toBe(grade);
  });
  it("is an em dash with no score", () => {
    expect(letterGrade(null)).toBe("—");
  });
});

describe("computeClientScores", () => {
  it("excludes ISPM entirely when marked not applicable", () => {
    const q = snap({ assets: 10, active: 100 });
    const scores = computeClientScores(q, [q], [], true);
    expect(scores.ispmHealth).toBeNull();
    expect(scores.ispmCompliancePct).toBeNull();
    expect(scores.compositeScore).toBe(scores.vulnHealth);
  });
});

describe("compositeScoreSeries", () => {
  const ispmSnap = (date: string, pct: number): IspmSnapshotSummary => ({
    date,
    totalCount: 10,
    compliantCount: 5,
    weightedCompliancePct: pct,
  });

  it("returns an empty series for an empty Qualys series", () => {
    expect(compositeScoreSeries([], [ispmSnap("2026-01-01", 75)], false)).toEqual([]);
    expect(compositeScoreSeries(null, null, false)).toEqual([]);
  });

  it("scores vuln-only at every point when no ISPM history exists", () => {
    const series = [
      snap({ date: "2026-01-01", assets: 10, active: 100 }),
      snap({ date: "2026-01-08", assets: 10, active: 80 }),
    ];
    const pts = compositeScoreSeries(series, [], false);
    expect(pts).toHaveLength(2);
    // With a null ISPM side, compositeScore(vh, null) === vh — and each point's vulnHealth
    // must see only the series up to that date. Score is rounded for display; grade is from
    // the precise score.
    expect(pts[0]!.score).toBe(Math.round(vulnHealth(series[0]!, [series[0]!])!));
    expect(pts[1]!.score).toBe(Math.round(vulnHealth(series[1]!, series)!));
    expect(pts[1]!.grade).toBe(letterGrade(vulnHealth(series[1]!, series)));
  });

  it("carries the earliest ISPM level back before its first snapshot, and forward after", () => {
    const series = [
      snap({ date: "2026-01-01", assets: 10, active: 100 }),
      snap({ date: "2026-01-08", assets: 10, active: 100 }),
      snap({ date: "2026-01-15", assets: 10, active: 100 }),
    ];
    // ISPM history has a single snapshot, at the second scan date.
    const pts = compositeScoreSeries(series, [ispmSnap("2026-01-08", 75)], false);
    const ih = ispmTargetHealth(75);
    // 2026-01-01 precedes the only snapshot; its 75% level carries back rather than dropping to
    // vuln-only (which would put a phantom step in the line where ISPM turns on).
    expect(pts[0]!.score).toBe(Math.round(compositeScore(vulnHealth(series[0]!, [series[0]!]), ih)!));
    expect(pts[1]!.score).toBe(Math.round(compositeScore(vulnHealth(series[1]!, series.slice(0, 2)), ih)!));
    // No ISPM snapshot on 2026-01-15 — the 01-08 one carries forward.
    expect(pts[2]!.score).toBe(Math.round(compositeScore(vulnHealth(series[2]!, series), ih)!));
  });

  it("pins the latest point to current ISPM so the trend endpoint equals the grade card", () => {
    const series = [
      snap({ date: "2026-01-01", assets: 10, active: 100 }),
      snap({ date: "2026-01-15", assets: 10, active: 60 }),
    ];
    // No recorded ISPM history yet, but the client currently sits at 40% weighted compliance —
    // the exact scenario that made the chart's endpoint disagree with the grade card.
    const pts = compositeScoreSeries(series, [], false, 40);
    const ih = ispmTargetHealth(40);
    // Endpoint blends the same inputs the grade card uses: vulnHealth over the full series +
    // current ISPM health.
    expect(pts[pts.length - 1]!.score).toBe(Math.round(compositeScore(vulnHealth(series[1]!, series), ih)!));
    // With no snapshots, current carries back to earlier points too — one consistent composite line.
    expect(pts[0]!.score).toBe(Math.round(compositeScore(vulnHealth(series[0]!, [series[0]!]), ih)!));
  });

  it("uses the latest at-or-before ISPM snapshot when several exist", () => {
    const series = [snap({ date: "2026-02-01", assets: 10, active: 50 })];
    const pts = compositeScoreSeries(
      series,
      [ispmSnap("2026-01-01", 20), ispmSnap("2026-01-20", 90), ispmSnap("2026-03-01", 10)],
      false
    );
    // 2026-01-20 is the latest at-or-before 2026-02-01; the 2026-03-01 one is in the future.
    expect(pts[0]!.score).toBe(Math.round(compositeScore(vulnHealth(series[0]!, series), ispmTargetHealth(90))!));
  });

  it("ignores ISPM history entirely for not-applicable clients", () => {
    const series = [snap({ date: "2026-01-08", assets: 10, active: 80 })];
    const pts = compositeScoreSeries(series, [ispmSnap("2026-01-01", 75)], true);
    expect(pts[0]!.score).toBe(Math.round(vulnHealth(series[0]!, series)!));
  });

  it("excludes undated legacy snapshots", () => {
    const series = [snap({ date: null, assets: 10, active: 100 }), snap({ date: "2026-01-08", assets: 10, active: 80 })];
    const pts = compositeScoreSeries(series, [], false);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.date).toBe("2026-01-08");
  });

  it("yields a null score (dash grade) when a point has no computable health", () => {
    // Zero assets → vulnHealth null; no ISPM → composite null.
    const series = [snap({ date: "2026-01-01", assets: 0, active: 0 })];
    const pts = compositeScoreSeries(series, [], false);
    expect(pts[0]!.score).toBeNull();
    expect(pts[0]!.grade).toBe("—");
  });
});

// Every test above calls the scoring functions without a goals argument, so together they are the
// regression guard that DEFAULT_CLIENT_GOALS still reproduces the original hardcoded 10 / 75%
// targets and the 55/45 blend. These cover the per-client path.
describe("per-client goals", () => {
  it("defaults to the original hardcoded targets", () => {
    expect(DEFAULT_CLIENT_GOALS).toEqual({ vulnTargetPerAsset: 10, ispmTargetPct: 75 });
  });

  it("re-anchors the vuln target so the client's own target scores 85", () => {
    const g = { ...DEFAULT_CLIENT_GOALS, vulnTargetPerAsset: 5 };
    expect(vulnTargetHealth(5, g)).toBeCloseTo(85, 5);
    // 10/asset used to be "on target"; against a stricter goal it now scores below it.
    expect(vulnTargetHealth(10, g)).toBeLessThan(85);
  });

  it("re-anchors the ISPM target so the client's own target scores 85 and 100% still scores 100", () => {
    const g = { ...DEFAULT_CLIENT_GOALS, ispmTargetPct: 90 };
    expect(ispmTargetHealth(90, g)).toBeCloseTo(85, 5);
    expect(ispmTargetHealth(100, g)).toBeCloseTo(100, 5);
    expect(ispmTargetHealth(75, g)).toBeLessThan(85);
  });

  it("threads goals through computeClientScores", () => {
    const q = snap({ assets: 10, active: 100 });
    const strict = computeClientScores(q, [q], [], true, { ...DEFAULT_CLIENT_GOALS, vulnTargetPerAsset: 5 });
    const loose = computeClientScores(q, [q], [], true, { ...DEFAULT_CLIENT_GOALS, vulnTargetPerAsset: 20 });
    expect(strict.compositeScore!).toBeLessThan(loose.compositeScore!);
  });

  it("threads goals through compositeScoreSeries", () => {
    const series = [
      snap({ date: "2026-01-01", assets: 10, active: 100 }),
      snap({ date: "2026-01-08", assets: 10, active: 80 }),
    ];
    const strict = compositeScoreSeries(series, [], false, null, { ...DEFAULT_CLIENT_GOALS, vulnTargetPerAsset: 5 });
    const base = compositeScoreSeries(series, [], false);
    expect(strict[1]!.score!).toBeLessThan(base[1]!.score!);
  });

  // The blend is deliberately NOT per-client — two clients' scores must stay comparable.
  it("keeps the composite blend fixed at 55/45", () => {
    expect(compositeScore(80, 90)).toBeCloseTo(80 * 0.55 + 90 * 0.45, 5);
  });

  describe("normalizeGoals", () => {
    it("fills in defaults for missing or non-numeric fields", () => {
      expect(normalizeGoals(null)).toEqual(DEFAULT_CLIENT_GOALS);
      expect(normalizeGoals({})).toEqual(DEFAULT_CLIENT_GOALS);
      expect(normalizeGoals({ vulnTargetPerAsset: NaN })).toEqual(DEFAULT_CLIENT_GOALS);
      expect(normalizeGoals({ ispmTargetPct: "80" as unknown as number }).ispmTargetPct).toBe(75);
    });

    // Both bounds exist to stop a divide-by-zero in the scoring curves, not for taste.
    it("keeps the vuln target above zero", () => {
      expect(normalizeGoals({ vulnTargetPerAsset: 0 }).vulnTargetPerAsset).toBe(0.1);
      expect(Number.isFinite(vulnTargetHealth(5, normalizeGoals({ vulnTargetPerAsset: 0 })))).toBe(true);
    });

    it("keeps the ISPM target below 100", () => {
      expect(normalizeGoals({ ispmTargetPct: 100 }).ispmTargetPct).toBe(99);
      expect(Number.isFinite(ispmTargetHealth(100, normalizeGoals({ ispmTargetPct: 100 })))).toBe(true);
    });

    it("clamps absurd values rather than rejecting them", () => {
      expect(normalizeGoals({ vulnTargetPerAsset: 1e9 }).vulnTargetPerAsset).toBe(1000);
      expect(normalizeGoals({ ispmTargetPct: -5 }).ispmTargetPct).toBe(1);
    });
  });
});
