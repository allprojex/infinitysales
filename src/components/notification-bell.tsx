import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, AlertCircle, AlertTriangle, Info, CheckCheck, ExternalLink } from "lucide-react";

interface Notif {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: string;
  is_read: boolean;
  created_at: string;
}

const SEV_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const fmt = (d: string) => {
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short" });
};

export function NotificationBell() {
  const qc = useQueryClient();

  const { data: summary } = useQuery<{ unread: number; critical: number }>({
    queryKey: ["notifications-summary"],
    queryFn: () => customFetch("/api/notifications/summary"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: recentRaw } = useQuery<Notif[] | { items: Notif[] }>({
    queryKey: ["notifications-recent"],
    queryFn: () => customFetch("/api/notifications?limit=8"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const recent: Notif[] = Array.isArray(recentRaw) ? recentRaw : (recentRaw?.items ?? []);

  const markRead = useMutation({
    mutationFn: (id: number) => customFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
      qc.invalidateQueries({ queryKey: ["notifications-recent"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => customFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
      qc.invalidateQueries({ queryKey: ["notifications-recent"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = summary?.unread ?? 0;
  const critical = summary?.critical ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className={`h-4 w-4 ${critical > 0 ? "text-red-400" : ""}`} />
          {unread > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none ${critical > 0 ? "bg-red-500" : "bg-primary"}`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-muted-foreground"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Items */}
        <div className="max-h-80 overflow-y-auto">
          {recent.length === 0 && (
            <div className="py-8 text-center">
              <Bell className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-30" />
              <p className="text-xs text-muted-foreground">No notifications</p>
            </div>
          )}
          {recent.map((n) => {
            const Icon = SEV_ICON[n.severity] ?? Info;
            const color = SEV_COLOR[n.severity] ?? "text-blue-400";
            return (
              <div
                key={n.id}
                className={`flex gap-2.5 px-3 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 ${!n.is_read ? "bg-primary/5" : ""}`}
                onClick={() => !n.is_read && markRead.mutate(n.id)}
              >
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium truncate">{n.title}</p>
                    {!n.is_read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(n.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <DropdownMenuSeparator className="m-0" />
        <div className="p-2">
          <Link href="/notifications">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs gap-1.5 text-muted-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              View all notifications
            </Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
