import type { ReactNode } from "react";
import { cx } from "./cx";

export type PillTone = "crit" | "high" | "med" | "low" | "pass" | "fail" | "warn" | "signal" | "neutral";

/*
 * Status badge — the Tailwind successor to `.pill` / `.role-pill`. Tones use the theme-tuned
 * soft-tint tokens so the same semantic color reads correctly in dark and light. Severity tones
 * are data register only (two-register rule); `signal` is for identity/role chips.
 */
const tones: Record<PillTone, string> = {
  crit: "bg-crit-soft text-crit",
  high: "bg-crit-soft text-crit", // ISPM "High" gaps intentionally read as critical-red
  med: "bg-med-soft text-med",
  low: "bg-low-soft text-low",
  pass: "bg-pass-soft text-pass",
  fail: "bg-fail-soft text-fail",
  warn: "bg-warn-soft text-warn",
  signal: "bg-signal-soft text-signal",
  neutral: "bg-surface-2 text-ink-dim",
};

export function Pill({
  tone = "neutral",
  round,
  className,
  title,
  children,
}: {
  tone?: PillTone;
  /** fully-rounded chip (role badges) instead of the 4px data pill */
  round?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-block whitespace-nowrap px-2 py-[2px] text-center font-mono text-3xs font-semibold",
        round ? "rounded-full uppercase tracking-[.5px]" : "rounded-[4px]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
