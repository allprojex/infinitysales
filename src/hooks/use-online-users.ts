import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export interface OnlineUser {
  id: string;
  userId: string;
  userName: string;
  email: string | null;
  role: string;
  loginAt: string;
  lastSeen: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface OnlineUsersResponse {
  users: OnlineUser[];
  count: number;
  thresholdMinutes: number;
}

export const ONLINE_USERS_QUERY_KEY = ["online-users"] as const;

/**
 * Admin-only: fetches active online users with TanStack Query and keeps the
 * list in sync via a Supabase Realtime subscription on `user_sessions`.
 */
export function useOnlineUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const query = useQuery<OnlineUsersResponse>({
    queryKey: ONLINE_USERS_QUERY_KEY,
    queryFn: () => customFetch<OnlineUsersResponse>("/api/admin/online-users"),
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isAdmin) return;
    const channelName = `user_sessions_admin_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, () => {
        queryClient.invalidateQueries({ queryKey: ONLINE_USERS_QUERY_KEY });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  return {
    users: query.data?.users ?? [],
    count: query.data?.count ?? 0,
    thresholdMinutes: query.data?.thresholdMinutes ?? 5,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
