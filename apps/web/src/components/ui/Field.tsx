import {
  forwardRef,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

/*
 * Form primitives — the Tailwind successors to `.field` / `.formfield` / `.te-field`, which had
 * drifted into three near-identical copies. One label register (mono, uppercase, faint), one
 * control style (surface-2 + hairline + signal focus ring), one error/success line.
 */

const controlBase =
  // border-solid: preflight is off, and the UA default border-style on inputs/textareas is
  // `inset` (a beveled 3D groove) — without this the hairline renders as an inset shadow.
  "w-full rounded-lg border border-solid bg-surface-2 px-2.5 py-2 font-sans text-xs text-ink " +
  "transition-[border-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";

function controlClasses(invalid?: boolean, className?: string) {
  return cx(
    controlBase,
    invalid ? "border-fail focus-visible:outline-fail" : "border-line focus-visible:outline-signal",
    className
  );
}

export const Input = forwardRef<HTMLInputElement, { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>>(
  function Input({ invalid, className, autoFocus, ...rest }, ref) {
    // autoFocus handled imperatively: the DOM attribute only works on initial page load, so a
    // dynamically mounted input (MFA step, inline tag editor) never received focus (verified in
    // the browser — attribute present, activeElement stayed on <body>). Focus once on mount.
    const focusedOnce = useRef(false);
    return (
      <input
        ref={(el) => {
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
          if (el && autoFocus && !focusedOnce.current) {
            focusedOnce.current = true;
            el.focus();
          }
        }}
        className={controlClasses(invalid, className)}
        {...rest}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, { invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ invalid, className, ...rest }, ref) {
    return <select ref={ref} className={cx(controlClasses(invalid, className), "cursor-pointer")} {...rest} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(controlClasses(invalid, className), "min-h-[74px] resize-y leading-normal")}
      {...rest}
    />
  );
});

/**
 * Label + control + message. Pass the control as children — Field wires the label's htmlFor to
 * the control wrapper via an id on a plain <div>? No: to stay markup-light it renders a <label>
 * around the control, which associates implicitly and keeps click-to-focus for free.
 */
export function Field({
  label,
  error,
  success,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  /** red mono line under the control (the `.loaderr` register) */
  error?: ReactNode;
  /** green mono line (the `.form-ok` register) */
  success?: ReactNode;
  /** dim explainer under the control */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const msgId = useId();
  return (
    <label className={cx("mb-4 block", className)}>
      <span className="mb-[5px] block font-mono text-3xs uppercase tracking-[.5px] text-ink-faint">{label}</span>
      {children}
      {hint != null && <span className="mt-1 block text-2xs text-ink-faint">{hint}</span>}
      {error != null && (
        <span id={msgId} role="alert" className="mt-1.5 block font-mono text-2xs text-fail">
          {error}
        </span>
      )}
      {success != null && (
        <span className="mt-1.5 block font-mono text-2xs text-pass" role="status">
          {success}
        </span>
      )}
    </label>
  );
}
