import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "../Icon";
import { cx } from "./cx";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Modals can nest (a ConfirmDialog on top of another modal), and Escape/Tab must only act on
// the top-most one — a plain per-modal keydown listener would close the whole stack at once.
const openModals: symbol[] = [];

/**
 * Keyboard behavior for the modal panel: Escape calls onClose, Tab is trapped inside the panel,
 * focus moves into the panel on open and back to the trigger on close.
 */
function useModalA11y(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (it changes identity every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = Symbol("modal");
    openModals.push(id);
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    // Don't fight an autoFocus-ed field — React runs those before effects.
    if (!panel?.contains(document.activeElement)) focusables()[0]?.focus();

    function onKeydown(e: KeyboardEvent) {
      if (openModals[openModals.length - 1] !== id) return; // a modal is stacked on top of us
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      openModals.splice(openModals.indexOf(id), 1);
      opener?.focus();
    };
  }, []);

  return { panelRef, panelProps: { role: "dialog", "aria-modal": true } as const };
}

/*
 * Modal shell — focus trap, Escape, nesting (module-level stack above) plus the shared
 * overlay/panel/header markup so every dialog stops hand-rolling it. The panel carries the
 * restrained-depth shadow-md — modals are the "most raised" thing in the app, so they're where
 * the elevation budget gets spent. Entrance is motion-safe only.
 */
export function Modal({
  title,
  onClose,
  footer,
  maxWidth = 760,
  alert,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** right-aligned action row; omit for footerless dialogs */
  footer?: ReactNode;
  /** px — 440 for confirms, 560 for small forms, 760 (default) for data entry */
  maxWidth?: number;
  /** role="alertdialog" for destructive confirms */
  alert?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const { panelRef, panelProps } = useModalA11y(onClose);
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-6 backdrop-blur-[3px] motion-safe:animate-overlay-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        {...panelProps}
        role={alert ? "alertdialog" : "dialog"}
        aria-labelledby={titleId}
        style={{ maxWidth }}
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded border border-line bg-surface shadow-md motion-safe:animate-panel-in max-sm:max-h-[94vh]"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-line px-6 py-[18px]">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer rounded-[5px] border-none bg-transparent px-1.5 py-1 text-[16px] leading-none text-ink-faint transition-colors hover:text-ink"
          >
            <Icon name="close-outline" />
          </button>
        </div>
        <div className={cx("flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>{children}</div>
        {footer != null && (
          <div className="flex flex-shrink-0 justify-end gap-2.5 border-t border-line px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
