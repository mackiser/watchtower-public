import { compositeScoreSeries } from "@watchtower/shared";
import type { ClientGoals, HistoryRow, IspmSnapshotSummary, QualysSnapshot } from "@watchtower/shared";

/**
 * Scan-by-scan history for one client. Score/grade come from compositeScoreSeries so the export
 * agrees with the trend chart; `currentIspmPct` is pinned to the latest scan the same way the chart
 * does. The ISPM column is the latest recorded snapshot at-or-before each scan (blank before any).
 */
export function historyRows(
  client: string,
  qSeries: QualysSnapshot[],
  ispmSeries: IspmSnapshotSummary[],
  ispmNotApplicable: boolean,
  currentIspmPct: number | null,
  goals: ClientGoals
): HistoryRow[] {
  const points = compositeScoreSeries(qSeries, ispmSeries, ispmNotApplicable, currentIspmPct, goals);
  const dated = qSeries.filter((s): s is QualysSnapshot & { date: string } => !!s.date);
  return dated.map((s, i) => {
    let ispm: number | null = null;
    if (!ispmNotApplicable) {
      for (const p of ispmSeries) if (p.date <= s.date) ispm = p.weightedCompliancePct;
      if (i === dated.length - 1 && currentIspmPct != null) ispm = currentIspmPct;
    }
    return {
      client,
      date: s.date,
      active: s.active,
      crit: s.crit,
      high: s.high,
      med: s.med,
      low: s.low,
      assets: s.assets,
      vulnsPerAsset: s.assets ? Math.round((s.active / s.assets) * 10) / 10 : null,
      score: points[i]?.score ?? null,
      grade: points[i]?.grade ?? "—",
      ispmCompliancePct: ispm == null ? null : Math.round(ispm),
    };
  });
}
