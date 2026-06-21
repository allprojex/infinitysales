import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { User, useGetMe, getGetMeQueryKey } from "@/workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { setLoginTime, clearLoginTime } from "@/lib/session-time";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSupabaseStorageKey() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  if (!url) return null;
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function getJwtExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.exp === "number" ? payload.exp : Math.floor(Date.now() / 1000) + 3600;
  } catch {
    return Math.floor(Date.now() / 1000) + 3600;
  }
}

function writeSupabaseAuthStorage(accessToken: string, refreshToken: string, user: User) {
  if (typeof window === "undefined") return;
  const storageKey = getSupabaseStorageKey();
  if (!storageKey) return;
  const expiresAt = getJwtExpiry(accessToken);
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: Math.max(expiresAt - Math.floor(Date.now() / 1000), 0),
      expires_at: expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: "authenticated",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {
          name: user.name,
          role: user.role,
        },
      },
    }),
  );
}

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  const storageKey = getSupabaseStorageKey();
  if (storageKey) localStorage.removeItem(storageKey);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("accessToken");
    }
    return null;
  });

  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const {
    data: user,
    isLoading,
    isError,
  } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (isError) {
      logout();
    }
  }, [isError]);

  useEffect(() => {
    const handleAuthLogout = () => logout();
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  useEffect(() => {
    if (token) {
      setLoginTime();
    }
  }, [token]);

  // Hydrate Supabase Realtime auth without triggering a browser-side auth/user
  // validation request; the app's own API remains the source of session truth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const access_token = localStorage.getItem("accessToken");
    if (access_token) {
      supabase.realtime.setAuth(access_token).catch(() => {});
    }
  }, []);

  const login = (newToken: string, user: User, newRefreshToken?: string) => {
    localStorage.setItem("accessToken", newToken);
    if (newRefreshToken) {
      localStorage.setItem("refreshToken", newRefreshToken);
      writeSupabaseAuthStorage(newToken, newRefreshToken, user);
    }
    setLoginTime();
    setToken(newToken);
    queryClient.setQueryData(getGetMeQueryKey(), user);
    supabase.realtime.setAuth(newToken).catch(() => {});
  };

  const logout = () => {
    // Best-effort end of online session before clearing the token.
    try {
      const tk = localStorage.getItem("accessToken");
      if (tk) {
        fetch("/api/sessions/end", {
          method: "POST",
          headers: { authorization: `Bearer ${tk}` },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    clearSupabaseAuthStorage();
    clearLoginTime();
    setToken(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    supabase.realtime.setAuth().catch(() => {});
    supabase.auth.signOut().catch(() => {});
    setLocation("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isAuthenticated: !!user && !!token,
        isLoading: !!token && isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
