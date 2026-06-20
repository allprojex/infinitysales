import { useEffect, useRef } from "react";
import { customFetch } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Pings the server to register/refresh the current user's online session.
 * Runs once on mount when authenticated, then every 60s while the tab is alive.
 * Best-effort end on tab close / sign-out.
 */
export function useSessionHeartbeat() {
  const { isAuthenticated, user } = useAuth();
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    stoppedRef.current = false;

    const ping = async () => {
      try {
        await customFetch("/api/sessions/heartbeat", { method: "POST" });
      } catch {
        // ignore transient errors
      }
    };

    const end = () => {
      try {
        const token = typeof window !== "undefined"
          ? window.localStorage.getItem("accessToken")
          : null;
        if (!token) return;
        // sendBeacon doesn't carry auth; use fetch keepalive
        fetch("/api/sessions/end", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      } catch {
        // ignore
      }
    };

    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    const onBeforeUnload = () => end();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      stoppedRef.current = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      end();
    };
  }, [isAuthenticated, user?.id]);
}
