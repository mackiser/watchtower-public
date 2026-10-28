import { gradeTone } from "@watchtower/shared";
import type { ClientSummary, HistoryRow } from "@watchtower/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useClients } from "../api/hooks";
import { AttentionCard } from "../components/AttentionCard";
import { Icon } from "../components/Icon";
import { KpiGrid } from "../components/KpiGrid";
import { Button, Input, Pill, Skeleton } from "../components/ui";
import { csvFilename, downloadCsv } from "../lib/csv";

// Sortable columns of the client table.
type SortCol = "name" | "compositeScore" | "vulnHealth" | "ispmHealth" | "openTaskCount";
const COLS: { k: SortCol; t: string }[] = [
  { k: "name", t: "Client" },
  { k: "compositeScore", t: "Overall" },
  { k: "vulnHealth", t: "Qualys health" },
  { k: "ispmHealth", t: "ISPM health" },
  { k: "openTaskCount", t: "Open tasks" },
];

function toneVar(score: number | null): string {
  const tone = gradeTone(score);
  return tone === "neutral" ? "var(--ink-faint)" : `var(--${tone})`;
}

// Staleness thresholds (days since the latest Qualys scan date): fine ≤10, warn 11–21, fail >21
// or never updated. Tunable here in one place.
function staleness(lastDate: string | null): { tone: "neutral" | "warn" | "fail"; label: string } {
  if (!lastDate) return { tone: "fail", label: "never updated" };
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
  if (days > 21) return { tone: "fail", label: `${days}d stale` };
  if (days > 10) return { tone: "warn", label: `${days}d ago` };
  return { tone: "neutral", label: `${days}d ago` };
}

export function OverviewPage() {
  const { data: clients, isLoading } = useClients();
  const navigate = useNavigate();
  // Click a column header to sort; clicking the same column flips direction. Default is worst
  // score first, so the clients that need attention lead the table.
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "compositeScore", dir: 1 });
  const [exportingHistory, setExportingHistory] = useState(false);

  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (clients ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sort.col === "name") return a.name.localeCompare(b.name) * sort.dir;
      const av = a[sort.col];
      const bv = b[sort.col];
      // No-data rows sink to the bottom in either direction; ties fall back to name.
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir || a.name.localeCompare(b.name);
    });
    return list;
  }, [clients, sort, search]);

  function onSort(col: SortCol) {
    // First click: A–Z for the name column, highest-first for the numeric ones.
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: col === "name" ? 1 : -1 }));
  }

  // Whole-portfolio history comes from the server (one row per client per scan) rather than
  // N per-client fetches; it isn't tied to the search/sort of the table above.
  async function exportHistory() {
    setExportingHistory(true);
    try {
      const rows = await api.get<HistoryRow[]>("/clients/export-history");
      downloadCsv(
        csvFilename("watchtower-history"),
        ["Client", "Scan date", "Score /100", "Grade", "Active vulns", "Critical", "High", "Medium", "Low", "Assets", "Vulns / asset", "ISPM compliance %"],
        rows.map((r) => [r.client, r.date, r.score, r.grade, r.active, r.crit, r.high, r.med, r.low, r.assets, r.vulnsPerAsset, r.ispmCompliancePct])
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't export history.");
    } finally {
      setExportingHistory(false);
    }
  }

  if (isLoading)
    return (
      <div>
        {/* Mirror the real page's structure (KPI grid, filters, table) so nothing shifts when
            data arrives. */}
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </div>
        <Skeleton className="mb-3 h-[38px] w-full max-w-md" />
        <Skeleton className="h-[320px]" />
      </div>
    );

  const scored = rows.filter((r) => r.compositeScore != null);
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.compositeScore ?? 0), 0) / scored.length) : null;
  const attention = scored.filter((r) => (r.compositeScore ?? 100) < 58).length;

  const kpis = [
    { label: "Total clients", value: String(rows.length), meta: "in this workspace", accent: "var(--signal)" },
    { label: "Average score", value: avg == null ? "—" : `${avg}/100`, meta: avg == null ? "no scored clients yet" : `across ${scored.length} scored client${scored.length === 1 ? "" : "s"}`, accent: avg == null ? "var(--ink-faint)" : toneVar(avg) },
    { label: "Needing attention", value: String(attention), meta: "score below 58", accent: attention ? "var(--fail)" : "var(--pass)" },
  ];

  return (
    <div>
      <AttentionCard clients={clients ?? []} />
      <KpiGrid cards={kpis} />
      <div className="filters !gap-3">
        <Input
          type="search"
          placeholder={`Search ${clients?.length ?? 0} client${(clients?.length ?? 0) === 1 ? "" : "s"}…`}
          aria-label="Search clients"
          className="w-auto min-w-[200px] flex-none py-1.5"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto flex items-center gap-3">
          <Button
            size="sm"
            icon="arrow-down-outline"
            disabled={!rows.length}
            title="Download the current view (filtered and sorted) as CSV"
            onClick={() =>
              downloadCsv(
                csvFilename("watchtower-overview"),
                ["Client", "Grade", "Overall /100", "Qualys health /100", "ISPM health /100", "Open tasks", "Last scan"],
                rows.map((r) => [
                  r.name,
                  r.grade,
                  r.compositeScore == null ? "" : Math.round(r.compositeScore),
                  r.vulnHealth == null ? "" : Math.round(r.vulnHealth),
                  r.ispmNotApplicable ? "N/A" : r.ispmHealth == null ? "" : Math.round(r.ispmHealth),
                  r.openTaskCount,
                  r.lastQualysDate ?? "never",
                ])
              )
            }
          >
            Export view
          </Button>
          <Button
            size="sm"
            icon="arrow-down-outline"
            disabled={exportingHistory || !clients?.length}
            title="Download every client's scan-by-scan history (scores, severities, ISPM %) as CSV"
            onClick={exportHistory}
          >
            {exportingHistory ? "Exporting…" : "Export history"}
          </Button>
        </div>
      </div>
      {rows.length === 0 && search.trim() ? (
        <p className="py-8 text-center text-xs text-ink-faint">No clients match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="ov-table-wrap">
          <table>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.k} aria-sort={sort.col === c.k ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
                    <button type="button" className="th-sort" onClick={() => onSort(c.k)}>
                      {c.t}{" "}
                      <span className="arrow">
                        {sort.col === c.k ? <Icon name={sort.dir > 0 ? "caret-up" : "caret-down"} /> : ""}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ClientRow key={r.id} client={r} onClick={() => navigate(`/clients/${r.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientRow({ client: r, onClick }: { client: ClientSummary; onClick: () => void }) {
  const overallCol = toneVar(r.compositeScore);
  const stale = staleness(r.lastQualysDate);
  return (
    <tr onClick={onClick}>
      {/* Whole-row click stays as a mouse convenience; the link is the keyboard/a11y path. */}
      <td className="ov-name">
        <Link to={`/clients/${r.id}`} onClick={(e) => e.stopPropagation()}>
          {r.name}
        </Link>
        {stale.tone !== "neutral" && (
          <Pill tone={stale.tone} className="ml-2">
            {stale.label}
          </Pill>
        )}
      </td>
      <td>
        {r.compositeScore == null ? (
          <span className="ov-na">No data</span>
        ) : (
          <div className="ov-score-cell">
            <span className="ov-grade" style={{ color: overallCol }}>
              {r.grade}
            </span>
            <span className="ov-num">{Math.round(r.compositeScore)}/100</span>
            <div className="ov-mini-track">
              <div className="ov-mini-fill" style={{ width: `${Math.round(r.compositeScore)}%`, background: overallCol }} />
            </div>
          </div>
        )}
      </td>
      <td>
        {r.vulnHealth == null ? (
          <span className="ov-na">No Qualys data</span>
        ) : (
          <div className="ov-score-cell">
            <span className="ov-num">{Math.round(r.vulnHealth)}/100</span>
            <div className="ov-mini-track">
              <div className="ov-mini-fill" style={{ width: `${Math.round(r.vulnHealth)}%`, background: toneVar(r.vulnHealth) }} />
            </div>
          </div>
        )}
      </td>
      <td>
        {r.ispmNotApplicable ? (
          <span className="ov-na">N/A</span>
        ) : r.ispmHealth == null ? (
          <span className="ov-na">No ISPM data</span>
        ) : (
          <div className="ov-score-cell">
            <span className="ov-num">{Math.round(r.ispmHealth)}/100</span>
            <div className="ov-mini-track">
              <div className="ov-mini-fill" style={{ width: `${Math.round(r.ispmHealth)}%`, background: toneVar(r.ispmHealth) }} />
            </div>
          </div>
        )}
      </td>
      <td>
        <span className={`ov-open-count${r.openTaskCount ? "" : " zero"}`}>{r.openTaskCount}</span>
      </td>
    </tr>
  );
}
