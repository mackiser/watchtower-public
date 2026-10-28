import { ispmPctTone, rate } from "@watchtower/shared";
import type { ClientGoals, IspmControl } from "@watchtower/shared";

/** Category/enforcement-group compliance bars — ported from bars() in the original app.
 *  Segments grow in on mount (grow-w keyframes, staggered by row). */
export function RateBars({
  controls,
  groupKey,
  goals,
}: {
  controls: IspmControl[];
  groupKey: "category" | "group";
  goals: ClientGoals;
}) {
  const groups = new Map<string, IspmControl[]>();
  controls.forEach((c) => {
    const k = c[groupKey];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  });
  const rows = [...groups.entries()].map(([name, items]) => ({ name, ...rate(items) })).sort((a, b) => a.pct - b.pct);

  return (
    <>
      {rows.map((gr, i) => {
        const tone = ispmPctTone(gr.pct, goals);
        const grow = { animation: `grow-w .6s var(--ease) ${i * 50}ms both` };
        return (
          <div
            className="crow"
            key={gr.name}
            title={`${gr.name}: ${gr.pass} of ${gr.total} controls compliant (${gr.pct}%)`}
          >
            <span className="name" title={gr.name}>
              {gr.name}
            </span>
            <span className="track">
              <span className="seg-pass" style={{ width: `${gr.pct}%`, ...grow }} />
              <span className="seg-fail" style={{ width: `${100 - gr.pct}%`, ...grow }} />
            </span>
            <span className="score">
              <b style={{ color: `var(--${tone})` }}>{gr.pct}%</b> {gr.pass}/{gr.total}
            </span>
          </div>
        );
      })}
    </>
  );
}
