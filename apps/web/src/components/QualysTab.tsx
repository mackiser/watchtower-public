import { vulnTrendInfo } from "@watchtower/shared";
import type { ClientDetail } from "@watchtower/shared";
import { Icon } from "./Icon";
import { KpiGrid } from "./KpiGrid";
import { LineChart } from "./LineChart";
import { TopVulnsCard } from "./TopVulnsCard";
import { Card } from "./ui";
import { VerticalBars } from "./VerticalBars";

const SEV: { key: "crit" | "high" | "med" | "low"; label: string; color: string }[] = [
  { key: "crit", label: "Critical", color: "var(--crit)" },
  { key: "high", label: "High", color: "var(--high)" },
  { key: "med", label: "Medium", color: "var(--med)" },
  { key: "low", label: "Low", color: "var(--low)" },
];

export function QualysTab({ client }: { client: ClientDetail }) {
  const q = client.qualys;
  const series = client.qSeries;
  const VULN_TARGET_PER_ASSET = client.goals.vulnTargetPerAsset;

  if (!q) {
    return (
      <div>
        <div className="scope">
          <span>{client.name} &middot; no Qualys sheet found</span>
        </div>
        <Card>
          <p className="py-2 text-xs text-ink-faint">
            No Qualys data for this client yet — set their Qualys tag in Manage Clients and the daily sync
            will pull the first scan.
          </p>
        </Card>
      </div>
    );
  }

  const sevSum = q.crit + q.high + q.med + q.low;
  const avg = q.assets ? q.active / q.assets : 0;
  const fixedTotal = q.fix030 + q.fix3060 + q.fix6090;
  const onTarget = avg <= VULN_TARGET_PER_ASSET;

  const cards = [
    { label: "Active vulnerabilities", value: q.active.toLocaleString(), meta: `${q.crit.toLocaleString()} critical`, accent: "var(--crit)" },
    {
      label: "Avg vulns / asset",
      value: avg.toFixed(1),
      meta: `target ≤${VULN_TARGET_PER_ASSET} · ${onTarget ? "on target" : "above target"}`,
      accent: onTarget ? "var(--pass)" : "var(--warn)",
    },
    { label: "Detections fixed", value: fixedTotal.toLocaleString(), meta: "last 90 days", accent: "var(--pass)" },
    {
      label: "Assets pending reboot",
      value: q.reboot.toLocaleString(),
      meta: q.assets ? `${Math.round((q.reboot / q.assets) * 100)}% of fleet` : "",
      accent: "var(--warn)",
    },
  ];

  const trendInfo = vulnTrendInfo(series);
  let trendNode = <>Track this over successive scans to see remediation outpace discovery.</>;
  if (trendInfo) {
    const dir = trendInfo.pct < -0.5 ? "down" : trendInfo.pct > 0.5 ? "up" : "flat";
    const col = dir === "down" ? "var(--pass)" : dir === "up" ? "var(--fail)" : "var(--ink-dim)";
    const iconName = dir === "down" ? "arrow-down-outline" : dir === "up" ? "arrow-up-outline" : "ellipse";
    trendNode = (
      <>
        <b style={{ color: col }}>
          <Icon name={iconName} /> {Math.abs(Math.round(trendInfo.pct))}%
        </b>{" "}
        vs the first loaded scan ({trendInfo.scans} scans tracked).
      </>
    );
  }

  return (
    <div>
      <div className="scope">
        <span>
          {client.name} &middot; {q.assets.toLocaleString()} assets
          {q.date ? ` · scan ${q.date}` : ""}
        </span>
      </div>
      <KpiGrid cards={cards} />
      <div className="mb-6 grid gap-6 min-[900px]:grid-cols-2">
        <Card title="Active vulnerabilities by severity" hint="latest scan">
          <VerticalBars items={SEV.map((s) => ({ label: s.label, value: q[s.key], color: s.color }))} />
          {sevSum < q.active && (
            <p className="mt-3 text-center text-xs text-ink-faint">
              + {(q.active - sevSum).toLocaleString()} active detections without a severity rating
            </p>
          )}
        </Card>
        <Card title="Detections fixed" hint="by age of fix">
          <VerticalBars
            items={[
              { label: "0–30 days", value: q.fix030, color: "var(--pass)" },
              { label: "30–60 days", value: q.fix3060, color: "var(--pass-mid)" },
              { label: "60–90 days", value: q.fix6090, color: "var(--pass-deep)" },
            ]}
          />
          <div className="mt-4 flex items-baseline justify-between border-t border-line-soft pt-3.5">
            <span className="text-2xs text-ink-dim">Total fixed (90 days)</span>
            <span className="text-xl font-[650] text-pass tabular-nums">{fixedTotal.toLocaleString()}</span>
          </div>
        </Card>
      </div>
      {/* Latest-scan detail sits above the trend charts, matching how the KPI/severity cards
          above already precede the time series. */}
      <TopVulnsCard client={client} />
      <Card title="Total vulnerabilities over time" hint="by scan date" className="mb-6">
        {/* Threat-red, deliberately unlike the signal-blue posture-score chart above the tabs —
            this one is the burn-down; the goal chip in the toolbar says so too. */}
        <LineChart series={series} lines={[{ key: "active", label: "Active vulnerabilities", color: "var(--crit)" }]} />
        <p className="mt-3 text-xs text-ink-dim">{trendNode}</p>
      </Card>
      <Card title="Vulnerabilities over time by severity" hint="by scan date" className="mb-6">
        <LineChart series={series} lines={SEV} />
      </Card>
    </div>
  );
}
