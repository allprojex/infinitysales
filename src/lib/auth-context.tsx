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
