import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Lock,
  Unlock,
  Globe,
  Users,
  Activity,
  Loader2,
  RefreshCw,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Ban,
  CheckCircle2,
  XCircle,
  Fingerprint,
  Cpu,
  Zap,
  Search,
} from "lucide-react";

/* ─── shared helpers ─────────────────────────────────────────────────── */
const api = <T = unknown,>(path: string, init?: RequestInit) => customFetch<T>(`/api${path}`, init);

const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

const eventTypeIcon: Record<string, React.ReactNode> = {
  AUTH_FAILURE: <ShieldX className="h-3.5 w-3.5 text-red-400" />,
  ACCOUNT_LOCKED: <Lock className="h-3.5 w-3.5 text-orange-400" />,
  IP_BLOCKED: <Ban className="h-3.5 w-3.5 text-red-400" />,
  IP_UNBLOCKED: <Unlock className="h-3.5 w-3.5 text-green-400" />,
  RBAC_DENY: <ShieldAlert className="h-3.5 w-3.5 text-yellow-400" />,
  RATE_LIMIT: <Zap className="h-3.5 w-3.5 text-orange-400" />,
  DEVICE_NEW: <Fingerprint className="h-3.5 w-3.5 text-blue-400" />,
  API_ABUSE: <Cpu className="h-3.5 w-3.5 text-red-400" />,
  PHISHING_DETECTED: <Globe className="h-3.5 w-3.5 text-red-400" />,
  MANUAL_BLOCK: <Ban className="h-3.5 w-3.5 text-purple-400" />,
  LOGIN_SUCCESS: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
};

const TIMELINE_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

/* ─── types ──────────────────────────────────────────────────────────── */
interface SecurityStats {
  eventsLast24h: number;
  criticalLast24h: number;
  blockedIps: number;
  activeSessions: number;
  byType: { event_type: string; severity: string; n: number }[];
  timeline: { day: string; severity: string; n: number }[];
}

interface SecurityEvent {
  id: number;
  eventType: string;
  severity: string;
  ipAddress: string | null;
  userId: number | null;
  userName: string | null;
  endpoint: string | null;
  details: string | null;
  createdAt: string;
  metadata?: { geo?: { country?: string; city?: string; region?: string } };
}

interface LockedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  failedLoginAttempts: number;
}

interface BlockedIp {
  id: number;
  ipAddress: string;
  reason: string;
  failedAttempts: number;
  blockedUntil: string | null;
  createdAt: string;
}

interface ActiveSession {
  id: number;
  userId: number;
  userName: string;
  role: string;
  ipAddress: string | null;
  loginAt: string;
  lastSeen: string;
}

interface PhishingResult {
  riskLevel: "low" | "medium" | "high";
  combinedScore: number;
  heuristicScore: number;
  flags: string[];
  aiRiskLevel: string;
  aiVerdict: string;
  aiExplanation: string;
}

interface MFASettings {
  [key: string]: string;
}

interface ComplianceCheck {
  id: string;
  label: string;
  pass: boolean;
  severity: string;
}

interface ComplianceData {
  checks: ComplianceCheck[];
  passed: number;
  total: number;
  score: number;
}

interface AbuseRow {
  ip_address: string;
  hit_count: number;
  last_seen: string;
  user_name: string | null;
  user_id: number | null;
  dimension: "ip" | "user";
}

interface AbuseData {
  byIp: AbuseRow[];
  byUser: AbuseRow[];
}

/* ─── KPI Card ───────────────────────────────────────────────────────── */
function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Tab: Dashboard ─────────────────────────────────────────────────── */
function DashboardTab() {
  const {
    data: stats,
    isLoading,
    refetch,
  } = useQuery<SecurityStats>({
    queryKey: ["security-stats"],
    queryFn: () => api("/security/stats"),
    refetchInterval: 30_000,
  });

  const timelineData = (() => {
    if (!stats?.timeline) return [];
    const days: Record<string, Record<string, number>> = {};
    for (const row of stats.timeline) {
      const day = String(row.day ?? "").split("T")[0];
      if (!days[day]) days[day] = {};
      days[day][row.severity] = (days[day][row.severity] ?? 0) + row.n;
    }
    return Object.entries(days).map(([day, sev]) => ({
      day: day.slice(5),
      ...sev,
    }));
  })();

  const byTypeData = (stats?.byType ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.event_type] = (acc[r.event_type] ?? 0) + r.n;
    return acc;
  }, {});

  const barData = Object.entries(byTypeData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="Events (24h)"
          value={stats?.eventsLast24h ?? 0}
          icon={Activity}
          color="bg-blue-500/20 text-blue-400"
          subtitle="Security events logged"
        />
        <KpiCard
          title="Critical (24h)"
          value={stats?.criticalLast24h ?? 0}
          icon={ShieldX}
          color="bg-red-500/20 text-red-400"
          subtitle="High-priority threats"
        />
        <KpiCard
          title="Blocked IPs"
          value={stats?.blockedIps ?? 0}
          icon={Ban}
          color="bg-orange-500/20 text-orange-400"
          subtitle="Active IP blocks"
        />
        <KpiCard
          title="Active Sessions"
          value={stats?.activeSessions ?? 0}
          icon={Users}
          color="bg-green-500/20 text-green-400"
          subtitle="Users online (5m window)"
        />
      </div>

      {/* Threat timeline */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Threat Timeline — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              No events in the last 7 days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                {["critical", "high", "medium", "low"].map((sev) => (
                  <Area
                    key={sev}
                    type="monotone"
                    dataKey={sev}
                    stroke={TIMELINE_COLORS[sev]}
                    fill={TIMELINE_COLORS[sev]}
                    fillOpacity={0.15}
                    stackId="1"
                    name={sev}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Event type breakdown */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Event Type Breakdown — Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              No event data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {barData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        [
                          "#ef4444",
                          "#f97316",
                          "#eab308",
                          "#3b82f6",
                          "#8b5cf6",
                          "#06b6d4",
                          "#10b981",
                          "#6b7280",
                        ][i % 8]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Tab: Events ───────────────────────────────────────────────────── */
function EventsTab() {
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [ip, setIp] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: "30" });
  if (eventType !== "all") params.set("eventType", eventType);
  if (severity !== "all") params.set("severity", severity);
  if (ip) params.set("ip", ip);

  const { data, isLoading } = useQuery<{ data: SecurityEvent[]; total: number }>({
    queryKey: ["security-events", page, eventType, severity, ip],
    queryFn: () => api(`/security/events?${params}`),
  });

  const events = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select
          value={eventType}
          onValueChange={(v) => {
            setEventType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {[
              "AUTH_FAILURE",
              "ACCOUNT_LOCKED",
              "IP_BLOCKED",
              "IP_UNBLOCKED",
              "RBAC_DENY",
              "RATE_LIMIT",
              "DEVICE_NEW",
              "API_ABUSE",
              "PHISHING_DETECTED",
              "MANUAL_BLOCK",
            ].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(v) => {
            setSeverity(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {["critical", "high", "medium", "low"].map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs w-44"
            placeholder="Filter by IP…"
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-36">Timestamp</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Severity</TableHead>
              <TableHead className="text-xs">IP</TableHead>
              <TableHead className="text-xs">Location</TableHead>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground text-sm">
                  No security events found.
                </TableCell>
              </TableRow>
            ) : (
              events.map((ev) => (
                <TableRow key={ev.id} className="text-xs">
                  <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                    {format(new Date(ev.createdAt), "MMM d HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {eventTypeIcon[ev.eventType] ?? <Activity className="h-3.5 w-3.5" />}
                      {ev.eventType}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${severityColor[ev.severity]}`}
                    >
                      {ev.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{ev.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {ev.metadata?.geo?.country
                      ? `${ev.metadata.geo.city ?? ""} ${ev.metadata.geo.country}`.trim()
                      : "—"}
                  </TableCell>
                  <TableCell>{ev.userName ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {ev.details ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Total: {total}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Page {page} / {pages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Blocked IPs ───────────────────────────────────────────────── */
function BlockedIpsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ip: "", reason: "", durationMinutes: "" });

  const { data: blockedIps = [], isLoading } = useQuery<BlockedIp[]>({
    queryKey: ["blocked-ips"],
    queryFn: () => api("/security/blocked-ips"),
  });

  const unblock = useMutation({
    mutationFn: (ip: string) => api(`/security/blocked-ips/${ip}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocked-ips"] });
      qc.invalidateQueries({ queryKey: ["security-stats"] });
      toast({ title: "IP unblocked successfully" });
    },
    onError: () => toast({ title: "Failed to unblock IP", variant: "destructive" }),
  });

  const block = useMutation({
    mutationFn: () =>
      api("/security/blocked-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: form.ip,
          reason: form.reason || "manual_block",
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocked-ips"] });
      qc.invalidateQueries({ queryKey: ["security-stats"] });
      toast({ title: "IP blocked successfully" });
      setAddOpen(false);
      setForm({ ip: "", reason: "", durationMinutes: "" });
    },
    onError: () =>
      toast({ title: "Failed to block IP — check the IP format", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Block IP
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">IP Address</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs text-right">Failed Attempts</TableHead>
              <TableHead className="text-xs">Blocked Until</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="text-xs w-20">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : blockedIps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground text-sm">
                  No blocked IPs at this time.
                </TableCell>
              </TableRow>
            ) : (
              blockedIps.map((b) => (
                <TableRow key={b.id} className="text-xs">
                  <TableCell className="font-mono font-semibold">{b.ipAddress}</TableCell>
                  <TableCell className="text-muted-foreground">{b.reason}</TableCell>
                  <TableCell className="text-right">{b.failedAttempts}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.blockedUntil
                      ? format(new Date(b.blockedUntil), "MMM d, HH:mm")
                      : "Permanent"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(b.createdAt), "MMM d")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-green-500 hover:text-green-400 hover:bg-green-500/10"
                      onClick={() => unblock.mutate(b.ipAddress)}
                      disabled={unblock.isPending}
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      Unblock
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Block IP Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">IPv4 Address *</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="e.g. 192.168.1.100"
                value={form.ip}
                onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="manual_block, suspicious_activity…"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Duration (minutes, blank = 1 year)</Label>
              <Input
                className="h-8 text-sm mt-1"
                type="number"
                placeholder="e.g. 60"
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => block.mutate()} disabled={!form.ip || block.isPending}>
              {block.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Block IP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Tab: Active Sessions ───────────────────────────────────────────── */
function SessionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ users: ActiveSession[] }>({
    queryKey: ["online-users"],
    queryFn: () => api("/admin/online-users"),
    refetchInterval: 30_000,
  });

  const revoke = useMutation({
    mutationFn: (userId: number) => api(`/security/sessions/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-users"] });
      toast({ title: "Session revoked" });
    },
    onError: () => toast({ title: "Failed to revoke session", variant: "destructive" }),
  });

  const sessions = data?.users ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} active in last 5 minutes
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">IP Address</TableHead>
              <TableHead className="text-xs">Logged In</TableHead>
              <TableHead className="text-xs">Last Seen</TableHead>
              <TableHead className="text-xs w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground text-sm">
                  No active sessions.
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow key={s.id} className="text-xs">
                  <TableCell className="font-medium">{s.userName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {s.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {s.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(s.loginAt), "HH:mm")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(s.lastSeen), "HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => revoke.mutate(s.userId)}
                      disabled={revoke.isPending}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ─── Tab: API Abuse ─────────────────────────────────────────────────── */
function ApiAbuseTab() {
  const { data, isLoading } = useQuery<AbuseData>({
    queryKey: ["api-abuse"],
    queryFn: () => api("/security/api-abuse"),
    refetchInterval: 60_000,
  });

  const byIp = data?.byIp ?? [];
  const byUser = data?.byUser ?? [];

  const AbuseTable = ({ rows, colLabel }: { rows: AbuseRow[]; colLabel: string }) => (
    <div className="rounded-lg border border-border/50 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">{colLabel}</TableHead>
            <TableHead className="text-xs">IP Address</TableHead>
            <TableHead className="text-xs text-right">Abuse Events</TableHead>
            <TableHead className="text-xs">Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center h-24">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center h-24 text-muted-foreground text-sm">
                No abuse detected in the last 7 days.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="font-mono font-semibold">
                  {colLabel === "User" ? (r.user_name ?? `uid:${r.user_id}`) : r.ip_address}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{r.ip_address}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={`${r.hit_count >= 5 ? "bg-red-500/20 text-red-300 border-red-500/40" : "bg-orange-500/20 text-orange-300 border-orange-500/40"}`}
                  >
                    {r.hit_count}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.last_seen ? format(new Date(r.last_seen), "MMM d, HH:mm") : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        IPs and authenticated users that triggered abuse detection (≥80 req/min) in the last 7 days.
      </p>
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          By IP Address
        </h4>
        <AbuseTable rows={byIp} colLabel="IP Address" />
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          By Authenticated User
        </h4>
        <AbuseTable rows={byUser} colLabel="User" />
      </div>
    </div>
  );
}

/* ─── Tab: Phishing Checker ──────────────────────────────────────────── */
function PhishingTab() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<PhishingResult | null>(null);
  const { toast } = useToast();

  const check = useMutation({
    mutationFn: (v: string) =>
      api<PhishingResult>("/security/phishing-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: v }),
      }),
    onSuccess: (data) => setResult(data),
    onError: () => toast({ title: "Phishing check failed", variant: "destructive" }),
  });

  const riskColors: Record<string, string> = {
    low: "text-green-400 border-green-500/40 bg-green-500/10",
    medium: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    high: "text-red-400 border-red-500/40 bg-red-500/10",
  };
  const riskIcons: Record<string, React.ReactNode> = {
    low: <CheckCircle2 className="h-8 w-8 text-green-400" />,
    medium: <AlertTriangle className="h-8 w-8 text-yellow-400" />,
    high: <ShieldX className="h-8 w-8 text-red-400" />,
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <CardDescription>
        Enter a URL or suspicious text to run a phishing / fraud analysis. Combines heuristic rules
        with AI classification.
      </CardDescription>

      <div className="flex gap-2">
        <Input
          className="h-9"
          placeholder="https://paypa1-verify-account.tk/login or paste suspicious text…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input.trim() && check.mutate(input.trim())}
        />
        <Button
          className="h-9 shrink-0"
          onClick={() => check.mutate(input.trim())}
          disabled={!input.trim() || check.isPending}
        >
          {check.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {!check.isPending && <span className="ml-1">Analyse</span>}
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div
            className={`rounded-xl border p-4 flex items-center gap-4 ${riskColors[result.riskLevel]}`}
          >
            {riskIcons[result.riskLevel]}
            <div>
              <p className="font-bold text-lg capitalize">{result.riskLevel} Risk</p>
              <p className="text-sm opacity-80">
                Combined score: {result.combinedScore}/100 · Heuristic: {result.heuristicScore}/100
                · AI: {result.aiRiskLevel}
              </p>
            </div>
          </div>

          {result.aiVerdict && (
            <Card className="border-border/50">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  AI Verdict
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 text-sm">
                <p className="font-medium">{result.aiVerdict}</p>
                {result.aiExplanation && (
                  <p className="text-muted-foreground mt-1">{result.aiExplanation}</p>
                )}
              </CardContent>
            </Card>
          )}

          {result.flags.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Heuristic Flags ({result.flags.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1">
                {result.flags.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Tab: MFA & Security Settings ──────────────────────────────────── */
function MFASettingsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: settings = {}, isLoading } = useQuery<MFASettings>({
    queryKey: ["mfa-settings"],
    queryFn: () => api("/security/mfa-settings"),
  });

  const [local, setLocal] = useState<MFASettings>({});
  const merged = { ...settings, ...local };

  const save = useMutation({
    mutationFn: () =>
      api("/security/mfa-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa-settings"] });
      qc.invalidateQueries({ queryKey: ["compliance"] });
      setLocal({});
      toast({ title: "Security settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const toggle = (key: string, val: boolean) =>
    setLocal((p) => ({ ...p, [key]: val ? "true" : "false" }));
  const numSet = (key: string, val: string) => setLocal((p) => ({ ...p, [key]: val }));

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const dirty = Object.keys(local).length > 0;

  return (
    <div className="space-y-4 max-w-xl">
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Two-Factor Authentication Enforcement
          </CardTitle>
          <CardDescription className="text-xs">
            Require 2FA for specific roles on next login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "sec_require_2fa_admin", label: "Require 2FA — Admin" },
            { key: "sec_require_2fa_manager", label: "Require 2FA — Manager" },
            { key: "sec_require_2fa_cashier", label: "Require 2FA — Cashier" },
            { key: "sec_require_2fa_accountant", label: "Require 2FA — Accountant" },
            { key: "sec_require_2fa_user", label: "Require 2FA — General User" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-sm">{label}</Label>
              <Switch checked={merged[key] === "true"} onCheckedChange={(v) => toggle(key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Lockout & Session Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-sm flex-1">Lockout threshold (failed attempts)</Label>
            <Input
              className="h-8 w-24 text-sm"
              type="number"
              min={1}
              max={20}
              value={merged["sec_lockout_threshold"] ?? "5"}
              onChange={(e) => numSet("sec_lockout_threshold", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm flex-1">Block duration (minutes)</Label>
            <Input
              className="h-8 w-24 text-sm"
              type="number"
              min={1}
              value={merged["sec_lockout_duration_minutes"] ?? "30"}
              onChange={(e) => numSet("sec_lockout_duration_minutes", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm flex-1">Session timeout (minutes, 0 = no timeout)</Label>
            <Input
              className="h-8 w-24 text-sm"
              type="number"
              min={0}
              value={merged["sec_session_timeout_minutes"] ?? "0"}
              onChange={(e) => numSet("sec_session_timeout_minutes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save Security Settings
      </Button>
    </div>
  );
}

/* ─── Tab: Locked Users ──────────────────────────────────────────────── */
function LockedUsersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const {
    data: users = [],
    isLoading,
    refetch,
  } = useQuery<LockedUser[]>({
    queryKey: ["locked-users"],
    queryFn: () => api("/security/locked-users"),
    refetchInterval: 30_000,
  });

  const unlock = useMutation({
    mutationFn: (id: number) => api(`/security/locked-users/${id}/unlock`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: "Account unlocked", description: "The user can now log in again." });
      qc.invalidateQueries({ queryKey: ["locked-users"] });
      qc.invalidateQueries({ queryKey: ["security-stats"] });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to unlock account.", variant: "destructive" }),
  });

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Users locked out after exceeding the failed-login threshold. Unlock to restore access.
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
          <p className="text-sm">No locked accounts</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Failed Attempts</TableHead>
                <TableHead className="text-xs w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="text-xs">
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-red-400 font-mono">{u.failedLoginAttempts}</span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 border-green-500/40 text-green-400 hover:bg-green-500/10"
                      disabled={unlock.isPending}
                      onClick={() => unlock.mutate(u.id)}
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      Unlock
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Compliance ────────────────────────────────────────────────── */
function ComplianceTab() {
  const { data, isLoading } = useQuery<ComplianceData>({
    queryKey: ["compliance"],
    queryFn: () => api("/security/compliance"),
    refetchInterval: 60_000,
  });

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const checks = [...(data?.checks ?? [])].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  const scoreColor =
    (data?.score ?? 0) >= 80
      ? "text-green-400"
      : (data?.score ?? 0) >= 60
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-4 max-w-xl">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={
                      (data?.score ?? 0 >= 80)
                        ? "#22c55e"
                        : (data?.score ?? 0 >= 60)
                          ? "#eab308"
                          : "#ef4444"
                    }
                    strokeWidth="3"
                    strokeDasharray={`${((data?.score ?? 0) / 100) * 100} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span
                  className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${scoreColor}`}
                >
                  {data?.score ?? 0}%
                </span>
              </div>
              <div>
                <p className="font-semibold text-lg">Security Score</p>
                <p className="text-sm text-muted-foreground">
                  {data?.passed} / {data?.total} checks passed
                </p>
                <Progress value={data?.score ?? 0} className="mt-2 h-1.5 w-48" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${c.pass ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}
              >
                {c.pass ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                )}
                <span className="flex-1 text-sm">{c.label}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${severityColor[c.severity]}`}
                >
                  {c.severity}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function SecurityCentre() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-red-500/20">
          <ShieldCheck className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Security Centre</h1>
          <p className="text-xs text-muted-foreground">
            Enterprise-grade threat monitoring, brute-force protection &amp; compliance
          </p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="dashboard" className="text-xs">
            <Activity className="h-3.5 w-3.5 mr-1" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs">
            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
            Events
          </TabsTrigger>
          <TabsTrigger value="blocked-ips" className="text-xs">
            <Ban className="h-3.5 w-3.5 mr-1" />
            Blocked IPs
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs">
            <Users className="h-3.5 w-3.5 mr-1" />
            Active Sessions
          </TabsTrigger>
          <TabsTrigger value="abuse" className="text-xs">
            <Cpu className="h-3.5 w-3.5 mr-1" />
            API Abuse
          </TabsTrigger>
          <TabsTrigger value="phishing" className="text-xs">
            <Globe className="h-3.5 w-3.5 mr-1" />
            Phishing Checker
          </TabsTrigger>
          <TabsTrigger value="locked-users" className="text-xs">
            <Lock className="h-3.5 w-3.5 mr-1" />
            Locked Users
          </TabsTrigger>
          <TabsTrigger value="mfa" className="text-xs">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            MFA Settings
          </TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <EventsTab />
        </TabsContent>
        <TabsContent value="blocked-ips" className="mt-4">
          <BlockedIpsTab />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="abuse" className="mt-4">
          <ApiAbuseTab />
        </TabsContent>
        <TabsContent value="phishing" className="mt-4">
          <PhishingTab />
        </TabsContent>
        <TabsContent value="locked-users" className="mt-4">
          <LockedUsersTab />
        </TabsContent>
        <TabsContent value="mfa" className="mt-4">
          <MFASettingsTab />
        </TabsContent>
        <TabsContent value="compliance" className="mt-4">
          <ComplianceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
