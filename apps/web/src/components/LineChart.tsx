import { useId, useRef, useState } from "react";
import { fmtCompact, fmtShort, niceCeil, niceFloor } from "../lib/format";
import { Icon } from "./Icon";

export interface LineSpec<T> {
  key: keyof T & string;
  label: string;
  color: string;
}

type RangeKey = "30d" | "3m" | "6m" | "all" | "custom";
const PRESETS: { key: RangeKey; label: string; title: string }[] = [
  { key: "30d", label: "30D", title: "Last 30 days of scans" },
  { key: "3m", label: "3M", title: "Last 3 months of scans" },
  { key: "6m", label: "6M", title: "Last 6 months of scans" },
  { key: "all", label: "All", title: "Full scan history" },
];

/** Start of a preset window, anchored to the latest scan date rather than today — a stale or
 *  archived client still shows its most recent scans instead of an empty chart. */
function rangeStartMs(range: "30d" | "3m" | "6m", anchorIso: string): number {
  const d = new Date(anchorIso);
  if (range === "30d") d.setDate(d.getDate() - 30);
  else d.setMonth(d.getMonth() - (range === "3m" ? 3 : 6));
  return d.getTime();
}

/** Least-squares fit over point index. Returns the fitted first/last values (for drawing the
 *  trendline) and the % change between them across the visible window. */
function linearTrend(ys: number[]): { y0: number; y1: number; pct: number | null } | null {
  const n = ys.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, x) => {
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
  });
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const y0 = intercept;
  const y1 = slope * (n - 1) + intercept;
  return { y0, y1, pct: y0 !== 0 ? ((y1 - y0) / Math.abs(y0)) * 100 : null };
}

type TrendDir = "up" | "down" | "flat";
function trendDir(pct: number): TrendDir {
  return pct < -0.5 ? "down" : pct > 0.5 ? "up" : "flat";
}
function trendColor(dir: TrendDir, goodWhen: "up" | "down"): string {
  if (dir === "flat") return "var(--ink-dim)";
  return dir === goodWhen ? "var(--pass)" : "var(--fail)";
}

/** SVG multi-line trend chart — ported from renderLineChart() in the original app.
 *  2026-07 polish: draw-in animation (CSS keyframes in theme.css), crosshair + HTML tooltip
 *  (replaces SVG <title>), and a gradient area fill when there's a single series (stacked fills
 *  on the 5-line severity chart would just be mud, so multi-series stays stroke-only).
 *  Date-range picker (30D/3M/6M/All/custom) + trend display: single-series charts get a dashed
 *  best-fit trendline and a Δ%-over-range badge; multi-series charts get per-legend Δ% instead
 *  (four dashed overlays would be clutter). All filtering is client-side over the loaded series.
 *  Generic over the point shape: anything with a `date` and numeric fields plots — Qualys
 *  snapshots and composite-score points alike. */
export function LineChart<T extends { date: string | null }>({
  series,
  lines,
  yMax,
  initialZoomed = true,
  trendGoodWhen = "down",
}: {
  series: T[];
  lines: LineSpec<T>[];
  /** Fixed full-scale axis ceiling (e.g. 100 for score charts); default: nice-ceil of the data. */
  yMax?: number;
  /** Start zoomed to the data range (default) vs. full-scale. Full-scale suits a fixed-range
   *  metric like a 0–100 score, where zooming would exaggerate small movements. */
  initialZoomed?: boolean;
  /** Which trend direction is good news — "down" for vulnerability counts (default), "up" for
   *  scores. Drives the pass/fail coloring of the trend badge and legend deltas. */
  trendGoodWhen?: "up" | "down";
}) {
  const val = (p: T, key: keyof T & string): number => Number(p[key] ?? 0) || 0;
  const [zoomed, setZoomed] = useState(initialZoomed);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();

  const dated = series.filter((r) => r.date);
  // ISO yyyy-mm-dd strings compare correctly as strings.
  const minDate = dated.reduce<string>((a, p) => (a && a < p.date! ? a : p.date!), "");
  const maxDate = dated.reduce<string>((a, p) => (a > p.date! ? a : p.date!), "");
  // Range filtering needs dates; an undated legacy series just plots as-is without the picker.
  const hasDates = dated.length > 1;

  let filtered = dated;
  if (hasDates && range !== "all") {
    if (range === "custom") {
      filtered = dated.filter(
        (p) => (!customFrom || p.date! >= customFrom) && (!customTo || p.date! <= customTo)
      );
    } else {
      const cut = rangeStartMs(range, maxDate);
      filtered = dated.filter((p) => new Date(p.date!).getTime() >= cut);
    }
  }
  const pts = dated.length ? filtered : series;

  function pickRange(r: RangeKey) {
    setRange(r);
    setHoverI(null); // a stale hover index could point past the shorter filtered series
    if (r === "custom") {
      // Prefill with the data bounds so the inputs never start invalid/empty.
      if (!customFrom) setCustomFrom(minDate);
      if (!customTo) setCustomTo(maxDate);
    }
  }

  const single = lines.length === 1;
  // Per-line least-squares trend over the visible window (null when <2 points). Computed before
  // the toolbar JSX below, which renders the badge from it.
  const trends = lines.map((l) => linearTrend(pts.map((p) => val(p, l.key))));

  const toolbar = hasDates ? (
    <div className="lc-toolbar">
      <div className="lc-range" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`lc-zoombtn${range === p.key ? " active" : ""}`}
            aria-pressed={range === p.key}
            title={p.title}
            onClick={() => pickRange(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`lc-zoombtn${range === "custom" ? " active" : ""}`}
          aria-pressed={range === "custom"}
          title="Pick a custom date range"
          onClick={() => pickRange("custom")}
        >
          Custom
        </button>
        {range === "custom" && (
          <>
            <input
              type="date"
              aria-label="From date"
              value={customFrom}
              min={minDate}
              max={customTo || maxDate}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setHoverI(null);
              }}
            />
            <span className="lc-range-sep">–</span>
            <input
              type="date"
              aria-label="To date"
              value={customTo}
              min={customFrom || minDate}
              max={maxDate}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setHoverI(null);
              }}
            />
          </>
        )}
      </div>
      <div className="lc-toolbar-right">
        {/* Persistent goal direction — states which way this chart *should* move (a score climbs,
            a vuln count burns down), so two otherwise-similar line charts read differently and
            the pass/fail-colored trend badge next to it has context. */}
        <span className="lc-goal">
          <Icon name={trendGoodWhen === "down" ? "arrow-down-outline" : "arrow-up-outline"} size={11} />
          {trendGoodWhen === "down" ? "lower is better" : "higher is better"}
        </span>
        {/* trend badge slot — filled below once the visible points are known */}
        {renderBadge()}
        <button
          className="lc-zoombtn"
          onClick={() => setZoomed((z) => !z)}
          title={
            zoomed
              ? "Showing the zoomed range — click to show full scale from zero"
              : "Showing full scale from zero — click to zoom into the trend"
          }
        >
          {zoomed ? (
            <>
              <Icon name="expand-outline" /> Full scale
            </>
          ) : (
            <>
              <Icon name="contract-outline" /> Zoom to trend
            </>
          )}
        </button>
      </div>
    </div>
  ) : null;

  function renderBadge() {
    const t = single ? trends[0] : null;
    if (!t || t.pct == null) return null;
    const dir = trendDir(t.pct);
    return (
      <span className="lc-trendbadge" style={{ color: trendColor(dir, trendGoodWhen) }}>
        <Icon name={dir === "down" ? "arrow-down-outline" : dir === "up" ? "arrow-up-outline" : "ellipse"} size={11} />
        {dir === "flat" ? "flat over range" : `${Math.abs(Math.round(t.pct))}% over range`}
      </span>
    );
  }

  /** Legend with optional per-line Δ% suffixes (multi-series only — the single-series chart
   *  already shows its trend in the toolbar badge). */
  function legend(withDeltas: boolean) {
    return (
      <div className="lc-legend">
        {lines.map((l, i) => {
          const t = withDeltas && !single ? trends[i] : null;
          const dir = t?.pct != null ? trendDir(t.pct) : null;
          return (
            <span className="li" key={l.key}>
              <span className="sw" style={{ background: l.color }} />
              {l.label}
              {t?.pct != null && dir && (
                <span className="lc-delta" style={{ color: trendColor(dir, trendGoodWhen) }}>
                  {dir === "flat" ? (
                    "· flat"
                  ) : (
                    <>
                      <Icon name={dir === "up" ? "arrow-up-outline" : "arrow-down-outline"} size={10} />{" "}
                      {Math.abs(Math.round(t.pct))}%
                    </>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  if (series.length === 0) return <p className="empty">No scan data to plot.</p>;

  if (pts.length === 0) {
    // Data exists, but none inside the selected range — keep the toolbar so the user can widen it.
    return (
      <>
        {toolbar}
        <p className="empty">No scans in the selected range.</p>
      </>
    );
  }

  if (pts.length === 1) {
    const r = pts[0]!;
    return (
      <>
        {toolbar}
        <div className="lc-legend">
          {lines.map((l) => (
            <span className="li" key={l.key}>
              <span className="sw" style={{ background: l.color }} />
              {l.label}: <b style={{ color: l.color, marginLeft: 4 }}>{val(r, l.key).toLocaleString()}</b>
            </span>
          ))}
        </div>
        <p className="lc-single-note">
          {hasDates ? (
            <>Only one scan ({r.date ?? "undated"}) falls in the selected range — widen it to see the trend.</>
          ) : (
            <>
              Only one scan ({r.date ?? "undated"}) is loaded, so there&rsquo;s no trend to draw yet.
              <br />
              The line builds out here as daily syncs and ISPM edits record history.
            </>
          )}
        </p>
      </>
    );
  }

  const W = 900;
  const H = 300;
  const padL = 58;
  const padR = 20;
  const padT = 16;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = pts.length;
  const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  const allVals: number[] = [];
  lines.forEach((l) => pts.forEach((p) => allVals.push(val(p, l.key))));
  const dataMax = Math.max(...allVals);
  const dataMin = Math.min(...allVals);

  let axisMin: number;
  let axisMax: number;
  if (zoomed && dataMax > dataMin) {
    const span = dataMax - dataMin;
    const pad = Math.max(span * 0.15, dataMax * 0.02, 1);
    axisMin = Math.max(0, niceFloor(dataMin - pad));
    axisMax = niceCeil(dataMax + pad);
    if (axisMax === axisMin) axisMax = axisMin + 1;
    if (yMax != null) axisMax = Math.min(axisMax, yMax);
  } else {
    axisMin = 0;
    axisMax = yMax ?? niceCeil(Math.max(1, dataMax));
  }
  const yAt = (v: number) => padT + innerH - ((v - axisMin) / (axisMax - axisMin)) * innerH;
  // Fitted trendline endpoints can poke past the (padded) axis in zoomed mode; pin them inside.
  const yAtClamped = (v: number) => yAt(Math.max(axisMin, Math.min(axisMax, v)));

  const steps = 5;
  const stepVals = Array.from({ length: steps + 1 }, (_, s) => axisMin + ((axisMax - axisMin) / steps) * s);

  const everyX = Math.ceil(n / 8);

  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((x - padL) / innerW) * (n - 1));
    setHoverI(Math.max(0, Math.min(n - 1, i)));
  }

  const hovered = hoverI != null ? pts[hoverI] : null;
  // Values largest-first so the tooltip reads in the same vertical order as the lines.
  const hoverRows = hovered
    ? lines
        .map((l) => ({ ...l, value: val(hovered, l.key) }))
        .sort((a, b) => b.value - a.value)
    : [];

  // Remount the plotted geometry when the visible window changes so the draw-in replays.
  const rangeSig = `${range}|${customFrom}|${customTo}`;
  const trendLine = single ? trends[0] : null;

  return (
    <>
      {toolbar}
      <div className="linechart" style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverI(null)}
        >
          {single && (
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lines[0]!.color} stopOpacity=".22" />
                <stop offset="100%" stopColor={lines[0]!.color} stopOpacity="0" />
              </linearGradient>
            </defs>
          )}
          {stepVals.map((val, s) => {
            const y = yAt(val);
            return (
              <line key={`grid-${s}`} className="lc-grid" x1={padL} y1={y} x2={W - padR} y2={y} />
            );
          })}
          {stepVals.map((val, s) => {
            const y = yAt(val);
            return (
              <text key={`gridlbl-${s}`} className="lc-label" x={padL - 10} y={y + 3} textAnchor="end">
                {fmtCompact(val)}
              </text>
            );
          })}
          <line className="lc-axis" x1={padL} y1={padT} x2={padL} y2={padT + innerH} />
          <line className="lc-axis" x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} />
          {pts.map((p, i) =>
            i % everyX === 0 || i === n - 1 ? (
              <text key={`x-${i}`} className="lc-label" x={xAt(i)} y={H - padB + 22} textAnchor="middle">
                {p.date ? fmtShort(p.date) : `#${i + 1}`}
              </text>
            ) : null
          )}
          {hoverI != null && (
            <line
              x1={xAt(hoverI)}
              y1={padT}
              x2={xAt(hoverI)}
              y2={padT + innerH}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          )}
          <g key={rangeSig}>
            {single && (
              <path
                d={
                  pts.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(val(p, lines[0]!.key)).toFixed(1)}`).join(" ") +
                  ` L${xAt(n - 1).toFixed(1)},${padT + innerH} L${xAt(0).toFixed(1)},${padT + innerH} Z`
                }
                fill={`url(#${gradId})`}
                style={{ animation: "chart-fade .9s var(--ease) .3s both" }}
              />
            )}
            {trendLine && (
              <line
                x1={xAt(0)}
                y1={yAtClamped(trendLine.y0)}
                x2={xAt(n - 1)}
                y2={yAtClamped(trendLine.y1)}
                stroke={lines[0]!.color}
                strokeOpacity=".45"
                strokeWidth="1.5"
                strokeDasharray="6 5"
                strokeLinecap="round"
                style={{ animation: "chart-fade .9s var(--ease) .55s both" }}
              />
            )}
            {lines.map((l, li) => (
              <g key={l.key}>
                <path
                  d={pts.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(val(p, l.key)).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke={l.color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  style={{ animation: `lc-draw .9s var(--ease) ${li * 90}ms both` }}
                />
                {/* Only the latest point and the hovered one get a marker — a dot per scan buries
                    the trend on a long series. */}
                {pts.map(
                  (p, i) =>
                    (hoverI === i || i === pts.length - 1) && (
                      <circle
                        key={`dot-${l.key}-${i}`}
                        className="lc-dot"
                        cx={xAt(i)}
                        cy={yAt(val(p, l.key))}
                        r={hoverI === i ? 5 : 3.5}
                        fill="var(--field)"
                        stroke={l.color}
                        strokeWidth="2"
                      />
                    )
                )}
              </g>
            ))}
          </g>
        </svg>
        {hovered && hoverI != null && (
          <div
            className="lc-tip"
            style={{
              left: `${(xAt(hoverI) / W) * 100}%`,
              transform: `translateX(${hoverI > n * 0.72 ? "calc(-100% - 12px)" : "12px"})`,
            }}
          >
            <div className="lc-tip-date">{hovered.date ? fmtShort(hovered.date) : `scan ${hoverI + 1}`}</div>
            {hoverRows.map((r) => (
              <div className="lc-tip-row" key={r.key}>
                <span className="sw" style={{ background: r.color }} />
                <span className="lc-tip-label">{r.label}</span>
                <b>{r.value.toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {legend(true)}
    </>
  );
}
