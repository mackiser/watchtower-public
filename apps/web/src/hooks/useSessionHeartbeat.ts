import { useEffect } from "react";
import { api } from "../api/client";

// One ping per window of real user activity — enough to keep the 30-minute rolling session
// alive during passive use (reading a chart on a screen-share), rare enough to be free.
const HEARTBEAT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll"] as const;

/**
 * Keeps the session's rolling idle window alive while the user is genuinely active. Local
 * mouse/keyboard events set a flag (a plain variable — no state, no re-renders); every 5 minutes,
 * if there was activity, GET /auth/me touches the session server-side. A truly unattended
 * machine generates no events, sends no pings, and times out as intended. If the ping 401s
 * (session already gone), the api client's unauthorized event handles the sign-out flow.
 */
export function useSessionHeartbeat() {
  useEffect(() => {
    let active = false;
    const markActive = () => {
      active = true;
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, markActive, { passive: true });
    const interval = setInterval(() => {
      if (!active) return;
      active = false;
      api.get("/auth/me").catch(() => {});
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActive);
    };
  }, []);
}
