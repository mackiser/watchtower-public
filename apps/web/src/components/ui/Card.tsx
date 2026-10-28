import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/*
 * Section container — the Tailwind successor to `.panel`. Standardizes the surface + hairline +
 * 20px padding geometry; `raised` opts into the restrained-depth shadow for cards that genuinely
 * sit above the page (dashboards keep depth rare so the raised ones read as deliberate).
 */
export function Card({
  title,
  hint,
  actions,
  raised,
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  /** mono, uppercase, faint — the `.panel .hint` register for methodology notes */
  hint?: ReactNode;
  /** right-aligned header slot (buttons, toggles) */
  actions?: ReactNode;
  raised?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const hasHeader = title != null || hint != null || actions != null;
  return (
    <section
      className={cx(
        "rounded border border-line bg-surface px-[22px] py-5",
        raised && "shadow-sm",
        className
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="mb-1 flex items-center justify-between gap-3">
          {title != null && <h2 className="text-xs font-semibold tracking-[.3px] text-ink">{title}</h2>}
          {hint != null && (
            <span className="font-mono text-3xs uppercase tracking-[1px] text-ink-faint">{hint}</span>
          )}
          {actions}
        </div>
      )}
      <div className={hasHeader ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
