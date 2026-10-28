import { cx } from "./cx";

/** Pulsing placeholder block. Compose a few to sketch a loading page's shape. The global
 *  reduced-motion kill-switch in theme.css already stops the pulse. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded bg-surface-2", className)} />;
}
