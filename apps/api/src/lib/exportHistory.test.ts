import { describe, expect, it } from "vitest";
import type { QualysSnapshot } from "@watchtower/shared";
import { DEFAULT_CLIENT_GOALS } from "@watchtower/shared";
import { historyRows } from "./exportHistory.js";

const snap = (date: string | null, active: number): QualysSnapshot =>
  ({ date, active, crit: 1, high: 2, med: 3, low: 4, assets: 10, fix030: 0, fix3060: 0, fix6090: 0, reboot: 0 }) as QualysSnapshot;

describe("historyRows", () => {
  const ispm = [{ date: "2026-01-08", totalCount: 10, compliantCount: 5, weightedCompliancePct: 50 }];

  it("emits one row per dated scan, skipping undated legacy rows", () => {
    const rows = historyRows("Acme", [snap(null, 5), snap("2026-01-01", 40), snap("2026-01-15", 30)], ispm, false, 80, DEFAULT_CLIENT_GOALS);
    expect(rows.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-15"]);
    expect(rows[0]!.vulnsPerAsset).toBe(4);
  });

  it("blank ISPM before any snapshot, current pinned at the latest scan, blank when N/A", () => {
    const q = [snap("2026-01-01", 40), snap("2026-01-15", 30)];
    const rows = historyRows("Acme", q, ispm, false, 80, DEFAULT_CLIENT_GOALS);
    expect(rows.map((r) => r.ispmCompliancePct)).toEqual([null, 80]);
    const na = historyRows("Acme", q, ispm, true, null, DEFAULT_CLIENT_GOALS);
    expect(na.every((r) => r.ispmCompliancePct === null)).toBe(true);
  });
});
