import type { AuthUser } from "@watchtower/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLogout } from "../api/hooks";
import { Icon, type IconName } from "./Icon";

/**
 * Replaces the old name-link + Sign-out button in the header with a single avatar button that
 * opens a dropdown (account settings / change password / two-factor / sign out). Closes on
 * outside-click and Escape. Deep-links land on the matching /security section anchors.
 */
export function ProfileMenu({ user }: { user: AuthUser }) {
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-full bg-signal-soft text-signal transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        title={`${user.name} — ${user.email}`}
      >
        <Icon name="person-outline" size={17} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-[60] mt-2 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-md"
        >
          <div className="border-b border-line-soft px-3 py-2">
            <div className="truncate text-xs font-semibold text-ink">{user.name}</div>
            <div className="truncate font-mono text-3xs text-ink-faint">{user.email}</div>
          </div>
          <MenuLink to="/security#profile" icon="create-outline" label="Account settings" onNavigate={() => setOpen(false)} />
          <MenuLink to="/security#password" icon="lock-closed-outline" label="Change password" onNavigate={() => setOpen(false)} />
          <MenuLink to="/security#twofactor" icon="shield-checkmark-outline" label="Two-factor auth" onNavigate={() => setOpen(false)} />
          <div className="my-1 border-t border-line-soft" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-surface-2"
            onClick={() => {
              setOpen(false);
              logout.mutate();
            }}
          >
            <Icon name="log-out-outline" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, label, onNavigate }: { to: string; icon: IconName; label: string; onNavigate: () => void }) {
  return (
    <Link to={to} role="menuitem" className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink transition-colors hover:bg-surface-2" onClick={onNavigate}>
      <Icon name={icon} size={15} /> {label}
    </Link>
  );
}
