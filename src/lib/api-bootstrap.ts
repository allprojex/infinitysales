import { setBaseUrl, setAuthTokenGetter } from "@/workspace/api-client-react";

let initialized = false;

export function initApiClient() {
  if (initialized) return;
  initialized = true;

  const baseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (typeof window !== "undefined" ? window.location.origin : null);

  if (baseUrl) setBaseUrl(baseUrl);

  setAuthTokenGetter(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  });
}
