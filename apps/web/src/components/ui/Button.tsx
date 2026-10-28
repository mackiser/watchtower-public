import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

/*
 * The one button. Replaces the `.btn` class-string pattern so variants/sizes/loading are typed
 * instead of hand-assembled. Visual register (restrained-depth brief):
 *  - primary  — the only solid fill in the app; a whisper of top-light gradient + shadow on hover.
 *  - secondary — the classic Watchtower ghost button (surface-2 + hairline, signal on hover).
 *  - danger   — fail-tinted ghost; destructive actions never get a solid fill (too shouty).
 *  - ghost    — borderless; toolbars and icon-ish actions.
 */
const base =
  // border-solid: buttons inherit solid from the theme.css reset, but these classes also render
  // on <a>/<Link> (header nav) where the UA border-style is none — without it the border and its
  // hover color change are invisible there.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-solid font-mono " +
  "cursor-pointer no-underline transition-[border-color,background-color,color,box-shadow] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    // signal-solid, not signal: the filled button is the one place a white label sits directly on
    // the accent, and only the literal brand blue clears AA there in both themes.
    "border-signal-solid bg-signal-solid font-semibold text-white " +
    "bg-gradient-to-b from-white/15 to-transparent " +
    "hover:shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "border-line bg-surface-2 text-ink hover:border-signal",
  danger: "border-fail bg-fail-soft font-semibold text-fail hover:brightness-110",
  ghost: "border-transparent bg-transparent text-ink-dim hover:bg-surface-2 hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-3xs",
  md: "px-3 py-[7px] text-2xs",
};

export function buttonClasses(
  { variant = "secondary", size = "md" }: { variant?: ButtonVariant; size?: ButtonSize } = {},
  className?: string
): string {
  return cx(base, variants[variant], sizes[size], className);
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
};

export function Button({
  variant,
  size,
  icon,
  loading,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: CommonProps & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size }, className)}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        icon && <Icon name={icon} size={15} />
      )}
      {children}
    </button>
  );
}
