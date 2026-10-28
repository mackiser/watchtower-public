export interface KpiCard {
  label: string;
  value: string | number;
  meta?: string;
  accent?: string;
}

/** Metric tiles — Tailwind-first (was `.kpis`/`.kpi`). Tiles stay flat on purpose: the depth
 *  budget goes to the grade card, and a wall of shadowed boxes reads as noise. */
export function KpiGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-6">
      {cards.map((c) => (
        <div className="rounded border border-line bg-surface px-5 py-[18px]" key={c.label}>
          <div className="font-mono text-3xs uppercase tracking-[1px] text-ink-faint">{c.label}</div>
          <div
            className="mt-1.5 text-4xl font-[650] tracking-[-.5px] tabular-nums"
            style={{ color: c.accent ?? "var(--ink)" }}
          >
            {c.value}
          </div>
          {c.meta && <div className="mt-1 text-2xs text-ink-dim">{c.meta}</div>}
        </div>
      ))}
    </div>
  );
}
