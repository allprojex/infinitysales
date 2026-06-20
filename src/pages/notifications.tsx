import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, RefreshCw, CheckCheck, Trash2, AlertTriangle,
  Info, Package, ShoppingBag, CalendarOff, ClipboardCheck,
  X, AlertCircle,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface Notif {
  id: number; type: string; title: string; message: string;
  severity: string; is_read: boolean;
  entity_type: string | null; entity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

/* ── Constants ──────────────────────────────────────────── */
const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { label: "Critical", color: "text-red-400",    bg: "bg-red-500/20 border-red-500/30",    icon: AlertCircle },
  warning:  { label: "Warning",  color: "text-amber-400",  bg: "bg-amber-500/20 border-amber-500/30", icon: AlertTriangle },
  info:     { label: "Info",     color: "text-blue-400",   bg: "bg-blue-500/20 border-blue-500/30",   icon: Info },
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  out_of_stock:  Package,
  low_stock:     Package,
  expired:       Package,
  expiring_soon: Package,
  pending_po:    ShoppingBag,
  pending_leave: CalendarOff,
  high_variance: ClipboardCheck,
};

const TYPE_LABELS: Record<string, string> = {
  out_of_stock:  "Out of Stock",
  low_stock:     "Low Stock",
  expired:       "Expired",
  expiring_soon: "Expiring Soon",
  pending_po:    "Purchase Order",
  pending_leave: "Leave Request",
  high_variance: "Stock Variance",
};

const fmt = (d: string) => {
  const now = Date.now();
  const ms  = now - new Date(d).getTime();
  if (ms < 60_000)  return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short" });
};

/* ── Component ──────────────────────────────────────────── */
export default function Notifications() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab]               = useState("all");
  const [filterSev, setFilterSev]   = useState("all");
  const [filterType, setFilterType] = useState("all");

  /* ── Queries ──────────────────────────────────────────── */
  const params = new URLSearchParams({ limit: "200" });
  if (tab === "unread")           params.set("unread", "true");
  if (filterSev !== "all")        params.set("severity", filterSev);

  const { data: notifsRaw, isLoading, refetch } = useQuery<Notif[] | { data: Notif[] } | { items: Notif[] }>({
    queryKey: ["notifications", tab, filterSev],
    queryFn: () => customFetch(`/api/notifications?${params}`),
    refetchInterval: 30_000,
  });
  const notifs: Notif[] = Array.isArray(notifsRaw)
    ? notifsRaw
    : Array.isArray((notifsRaw as { data?: Notif[] })?.data)
      ? (notifsRaw as { data: Notif[] }).data
      : Array.isArray((notifsRaw as { items?: Notif[] })?.items)
        ? (notifsRaw as { items: Notif[] }).items
        : [];

  const { data: summary } = useQuery<{ unread: number; critical: number; warning: number; info: number }>({
    queryKey: ["notifications-summary"],
    queryFn: () => customFetch("/api/notifications/summary"),
    refetchInterval: 30_000,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const markRead = useMutation({
    mutationFn: (id: number) => customFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => customFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "All notifications marked as read" });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => customFetch(`/api/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
    },
  });

  const clearRead = useMutation({
    mutationFn: () => customFetch("/api/notifications/clear-all", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Read notifications cleared" });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-summary"] });
    },
  });

  /* ── Filtered rows ────────────────────────────────────── */
  let rows = notifs;
  if (filterType !== "all") rows = rows.filter(n => n.type === filterType);

  const criticalCount = notifs.filter(n => n.severity === "critical" && !n.is_read).length;
  const warningCount  = notifs.filter(n => n.severity === "warning"  && !n.is_read).length;

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
            {(summary?.unread ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                {summary!.unread > 99 ? "99+" : summary!.unread}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              Alerts for stock levels, expiry, and operational events
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["notifications-summary"] }); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {(summary?.unread ?? 0) > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className="h-3.5 w-3.5" />Mark All Read
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground"
            onClick={() => clearRead.mutate()} disabled={clearRead.isPending}>
            <Trash2 className="h-3.5 w-3.5" />Clear Read
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Unread",   value: summary?.unread   ?? 0, color: "text-primary",    bg: "border-primary/20 bg-primary/5" },
          { label: "Critical", value: summary?.critical ?? 0, color: "text-red-400",    bg: "border-red-500/20 bg-red-500/5" },
          { label: "Warnings", value: summary?.warning  ?? 0, color: "text-amber-400",  bg: "border-amber-500/20 bg-amber-500/5" },
          { label: "Info",     value: summary?.info     ?? 0, color: "text-blue-400",   bg: "border-blue-500/20 bg-blue-500/5" },
        ].map(c => (
          <Card key={c.label} className={c.bg}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3 h-7">All</TabsTrigger>
            <TabsTrigger value="unread" className="text-xs px-3 h-7 gap-1">
              Unread
              {(summary?.unread ?? 0) > 0 && (
                <span className="text-[10px] bg-red-500 text-white rounded-full px-1">{summary!.unread}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2 sm:ml-auto">
          <Select value={filterSev} onValueChange={setFilterSev}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground flex items-center">{rows.length} items</span>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && (
          <div className="flex justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">
                {tab === "unread" ? "No unread notifications" : "No notifications found"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Refresh to check for new alerts
              </p>
            </CardContent>
          </Card>
        )}
        {rows.map(n => {
          const sev = SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.info;
          const TypeIcon = TYPE_ICONS[n.type] ?? Bell;
          const SevIcon  = sev.icon;
          return (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all
                ${n.is_read
                  ? "bg-card border-border opacity-60"
                  : "bg-card border-border shadow-sm"
                }`}
            >
              {/* Severity dot */}
              <div className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${sev.bg}`}>
                <SevIcon className={`h-3.5 w-3.5 ${sev.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${sev.color}`}>
                    {sev.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {TYPE_LABELS[n.type] ?? n.type}
                  </span>
                  {!n.is_read && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{fmt(n.created_at)}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                {!n.is_read && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark read"
                    onClick={() => markRead.mutate(n.id)}>
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Dismiss"
                  onClick={() => dismiss.mutate(n.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
