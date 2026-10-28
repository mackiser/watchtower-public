import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// Self-hosted variable fonts (no network fetch — the app renders identically offline and
// behind strict CSP). theme.css's --sans/--mono lead with these families.
import "@fontsource-variable/work-sans";
import "@fontsource-variable/source-code-pro";
// Tailwind first so the hand-authored theme.css still wins on any class overlap during migration.
import "./tailwind.css";
import "./theme.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

// Expired-session handling: the api client dispatches this on any 401. Only a transition from
// signed-in → 401 is an expiry (a fresh visitor was never signed in, and must not see the
// "session expired" notice). Nulling ["me"] makes RequireAuth redirect to /login, preserving
// the from-location; clearing the rest prevents stale data flashing after the next sign-in.
window.addEventListener("watchtower:unauthorized", () => {
  if (queryClient.getQueryData(["me"])) {
    sessionStorage.setItem("wt-session-expired", "1");
    queryClient.setQueryData(["me"], null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
