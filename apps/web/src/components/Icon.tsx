import type { CSSProperties } from "react";
import { ICON_PATHS } from "./iconPaths";

// The exact set of Ionicons this app uses, rendered as inline SVG (see iconPaths.tsx for the
// path data and why it's inlined rather than loaded through ion-icon / a runtime fetch). Keeping
// this list explicit means a typo shows up as a TypeScript error instead of a blank icon.
export type IconName =
  | "grid-outline"
  | "list-outline"
  | "moon-outline"
  | "sunny-outline"
  | "add-outline"
  | "log-out-outline"
  | "people-outline"
  | "person-outline"
  | "bug-outline"
  | "shield-checkmark-outline"
  | "clipboard-outline"
  | "arrow-down-outline"
  | "arrow-up-outline"
  | "checkmark-outline"
  | "ellipse"
  | "close-outline"
  | "create-outline"
  | "trash-outline"
  | "caret-up"
  | "caret-down"
  | "expand-outline"
  | "contract-outline"
  | "chevron-down"
  | "chevron-forward"
  | "menu-outline"
  | "lock-closed-outline"
  | "refresh-outline"
  | "search-outline";

export function Icon({
  name,
  className,
  style,
  size,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
  size?: string | number;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`icon${className ? ` ${className}` : ""}`}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
