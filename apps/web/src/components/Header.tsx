import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMe } from "../api/hooks";
import { useTheme } from "../hooks/useTheme";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { ProfileMenu } from "./ProfileMenu";
import { cx } from "./ui";

// Nav-specific button treatment — ghost (no fill, no hairline) so five controls don't shout over
// the page they frame; a surface-2 wash appears on hover and the current location gets the signal
// tint. Sans 12px/medium, 16px icons via the `.navbtn` rule in theme.css. Deliberately NOT
// buttonClasses(): navigation is a wayfinding surface, not a form action.
const NAVBTN = cx(
  "navbtn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-solid border-transparent bg-transparent",
  "px-2.5 py-1.5 font-sans text-xs font-medium text-ink-dim cursor-pointer no-underline",
  "transition-[background-color,color] hover:bg-surface-2 hover:text-ink",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
);

export function Header({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { data: user } = useMe();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Shown on every page except the Overview itself (client detail pages, Admin > Users, etc.)
  // so there's always a way back — not just from a client page.
  const showAllClientsLink = location.pathname !== "/";

  // The primary/utility nav, rendered inline on desktop and stacked inside the mobile menu.
  // `stacked` makes each control a full-width row; `close` collapses the mobile menu after a tap.
  function nav(stacked: boolean) {
    const base = cx(NAVBTN, stacked && "w-full justify-start");
    // Signal-tinted current-location state — the nav's one splash of brand color.
    const active = "bg-signal-soft text-signal hover:text-signal";
    const navCls = (path: string) => cx(base, location.pathname.startsWith(path) && active);
    const close = () => setMobileOpen(false);
    return (
      <>
        {showAllClientsLink && (
          <button
            className={base}
            onClick={() => {
              navigate("/");
              close();
            }}
          >
            <Icon name="grid-outline" /> All Clients
          </button>
        )}
        {user?.role === "ADMIN" && (
          <Link className={navCls("/admin/clients")} to="/admin/clients" onClick={close}>
            <Icon name="list-outline" /> Manage Clients
          </Link>
        )}
        {user?.role === "ADMIN" && (
          <Link className={navCls("/admin/users")} to="/admin/users" onClick={close}>
            <Icon name="people-outline" /> Users
          </Link>
        )}
        {user?.role === "ADMIN" && (
          <Link className={navCls("/admin/audit")} to="/admin/audit" onClick={close}>
            <Icon name="clipboard-outline" /> Audit Log
          </Link>
        )}
        <button className={base} title="Toggle light / dark mode" onClick={toggle}>
          {theme === "light" ? (
            <>
              <Icon name="sunny-outline" /> Light
            </>
          ) : (
            <>
              <Icon name="moon-outline" /> Dark
            </>
          )}
        </button>
      </>
    );
  }

  return (
    <header>
      <div className="brand">
        <Logo />
        <span className="mark">WATCHTOWER</span>
        {/* Tagline yields first: with five nav controls (incl. Audit Log) the full brand line
            crowds the bar below ~1280px, so it only shows on genuinely wide screens. */}
        <span className="sub max-xl:!hidden">Security Posture &amp; Hardening Console</span>
      </div>
      <div className="spacer" />

      {/* Search lives outside the collapsing nav — reachable on every width without opening the
          menu. Icon-only; Ctrl+K is the power-user path (see Layout). */}
      {user && onOpenSearch && (
        <button className={NAVBTN} title="Search (Ctrl+K)" aria-label="Search" onClick={onOpenSearch}>
          <Icon name="search-outline" />
        </button>
      )}

      {/* Wide screens: inline nav. Below lg the five controls no longer fit alongside the brand,
          so they collapse behind the hamburger (was md — Audit Log pushed the fit point up). */}
      <nav className="flex items-center gap-1 max-lg:hidden">{nav(false)}</nav>

      {user && (
        <button
          className={cx(NAVBTN, "lg:hidden")}
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <Icon name={mobileOpen ? "close-outline" : "menu-outline"} />
        </button>
      )}

      {user && <ProfileMenu user={user} />}

      {/* Mobile menu panel — drops below the header, full width. */}
      {mobileOpen && user && (
        <div className="absolute inset-x-0 top-full z-50 flex flex-col gap-1 bg-surface px-5 py-3 shadow-sm lg:hidden">
          {nav(true)}
        </div>
      )}
    </header>
  );
}
