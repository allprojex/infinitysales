import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";

type Settings = Record<string, string | null>;

interface PermissionsContextType {
  canAccess: (permKey: string, defaultAllow?: boolean) => boolean;
  isLoading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => customFetch<Settings>("/api/settings"),
    enabled: isAuthenticated && user?.role !== "admin",
    staleTime: 60000,
  });

  const canAccess = (permKey: string, defaultAllow: boolean = true): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (isLoading || !settings) return defaultAllow;
    const value = settings[permKey];
    if (value == null) return defaultAllow;
    return value !== "false";
  };

  return (
    <PermissionsContext.Provider value={{ canAccess, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
