/** Circular progress ring — used for both the reboot gauge and the ISPM compliance donut.
 *  The arc sweeps in on mount via the ring-sweep CSS keyframes (pathLength=1 normalizes the
 *  dasharray to fractions); reduced-motion users get an instant cut. */
export function RingChart({
  fraction,
  color,
  centerValue,
  centerLabel,
  variant,
}: {
  fraction: number; // 0..1
  color: string;
  centerValue: string;
  centerLabel: string;
  variant: "gauge" | "donut";
}) {
  const frac = Math.max(0, Math.min(1, fraction));
  return (
    <div className={variant}>
      <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label={`${centerValue} ${centerLabel}`}>
        <circle r={64} cx="75" cy="75" fill="none" stroke="var(--surface-2)" strokeWidth="15" />
        <circle
          r={64}
          cx="75"
          cy="75"
          fill="none"
          stroke={color}
          strokeWidth="15"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${frac.toFixed(4)} 1`}
          style={{ animation: "ring-sweep .9s var(--ease) both" }}
        />
      </svg>
      <div className="center">
        <span className={variant === "gauge" ? "num" : "pct"} style={{ color }}>
          {centerValue}
        </span>
        <span className={variant === "gauge" ? "lbl" : "pct-lbl"}>{centerLabel}</span>
      </div>
    </div>
  );
}
