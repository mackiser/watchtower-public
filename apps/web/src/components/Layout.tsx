import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useSessionHeartbeat } from "../hooks/useSessionHeartbeat";
import { Header } from "./Header";
import { SearchPalette } from "./SearchPalette";

export function Layout() {
  // Layout only renders inside authenticated routes — the right scope for the keep-alive.
  useSessionHeartbeat();

  // Global search palette: Ctrl/Cmd+K anywhere in the app, or the header's search button.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // browsers bind Ctrl+K to their own address-bar search
        setSearchOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);

  return (
    <>
      <Header onOpenSearch={() => setSearchOpen(true)} />
      {import.meta.env.VITE_DEMO_EMAIL && (
        <p className="bg-signal-soft px-7 py-1.5 text-center text-2xs text-ink-dim">
          Read-only demo with fictional data — changes are disabled.
        </p>
      )}
      <main>
        <Outlet />
      </main>
      <footer>WATCHTOWER &mdash; security posture console</footer>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </>
  );
}
