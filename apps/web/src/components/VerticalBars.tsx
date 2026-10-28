export interface BarItem {
  label: string;
  value: number;
  color: string;
}

/** Vertical bar group — used for both the Qualys severity chart and the fix-age chart.
 *  Bars grow in on mount (grow-h keyframes, staggered) and carry a whisper of top-light
 *  gradient per the restrained-depth brief. */
export function VerticalBars({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="vbars">
      {items.map((it, i) => (
        <div className="vbar" key={it.label} title={`${it.label}: ${it.value.toLocaleString()}`}>
          <span className="val" style={{ color: it.color }}>
            {it.value.toLocaleString()}
          </span>
          <div className="colwrap">
            <div
              className="col"
              style={{
                height: `${((it.value / max) * 100).toFixed(1)}%`,
                backgroundColor: it.color,
                backgroundImage: "linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0) 55%)",
                animation: `grow-h .6s var(--ease) ${i * 70}ms both`,
              }}
            />
          </div>
          <span className="cap">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
