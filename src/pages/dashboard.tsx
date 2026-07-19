// @ts-nocheck
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetReportSummary,
  useGetRevenueOverTime,
  useGetRecentSales,
  useGetTopCustomers,
  useGetTopProducts,
  useGetAuditLogs,
  useListProducts,
  getListProductsQueryKey,
  getGetAuditLogsQueryKey,
  customFetch,
} from "@/workspace/api-client-react";
import { UsersTransactionSummaryWidget } from "@/components/users-transaction-summary-widget";
import { AppVersionBadge } from "@/components/app-version-badge";
import { SmokeTestPanel } from "@/components/smoke-test-panel";
import { useAuth } from "@/lib/auth-context";
import { usePosConnection } from "@/lib/use-pos-connection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  Banknote,
  Users,
  Package,
  ShoppingCart,
  TrendingUp,
  AlertCircle,
  Warehouse,
  BarChart2,
  Activity,
  ClipboardList,
  ArrowDown,
  RefreshCw,
  Monitor,
  Globe,
  Store,
  Phone,
  Zap,
  TrendingDown,
  ExternalLink,
  ShoppingBag,
  Wifi,
  X,
  Star,
  CalendarClock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

const PERIOD_LABELS: Record<string, string> = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
};

const auditDetailText = (log: Record<string, any>) => {
  const details = log.details;
  if (typeof details === "string") return details;
  if (details && typeof details === "object") {
    if (Array.isArray(details.changes)) return `Changes: ${details.changes.join(", ")}`;
    if (typeof details.error === "string") return details.error;
    return JSON.stringify(details);
  }
  return log.entityName ?? log.resource ?? log.entityType ?? "Activity";
};

type ChannelData = { channel: string; totalSales: number; revenue: number };
type DeadStockItem = {
  id: number;
  name: string;
  category: string | null;
  sku: string | null;
  stock: number;
  price: number;
  stockValue: number;
  unitsSoldRecent: number;
};
type ExpiringProduct = {
  id: number;
  name: string;
  category: string | null;
  sku: string | null;
  stock: number;
  price: number;
  expiryDate: string;
  stockValue: number;
  status: string;
};

function ExpiryAlertPanel() {
  const [items, setItems] = useState<ExpiringProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const { data: expData } = useQuery({
    queryKey: ["/api/reports/expired-inventory", { alertDays: 30 }],
    queryFn: () =>
      customFetch<{ items: ExpiringProduct[] }>("/api/reports/expired-inventory?alertDays=30"),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (!expData) return;
    setItems(
      (expData.items ?? []).filter((p) => {
        const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
        return days <= 30;
      }),
    );
    setLoading(false);
  }, [expData]);

  if (dismissed || loading || items.length === 0) return null;

  const expired = items.filter((p) => new Date(p.expiryDate) <= new Date());
  const expiringSoon = items.filter((p) => new Date(p.expiryDate) > new Date());

  return (
    <Card className="border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/10">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-orange-500" />
          <div>
            <CardTitle className="text-sm text-orange-700 dark:text-orange-400">
              Expiry Alerts — {items.length} product{items.length !== 1 ? "s" : ""}
            </CardTitle>
            <p className="text-xs text-orange-500 mt-0.5">
              {expired.length > 0 && (
                <span className="font-semibold">{expired.length} expired · </span>
              )}
              {expiringSoon.length > 0 && (
                <span>{expiringSoon.length} expiring within 30 days</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alert"
          className="text-orange-400 hover:text-orange-600 transition-colors mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-1.5 max-h-[200px] overflow-y-auto pr-1">
          {items.slice(0, 10).map((p) => {
            const daysLeft = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
            const isExpired = daysLeft <= 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.stock} units · {GHS(p.stockValue)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    className={`text-[10px] h-5 px-2 ${isExpired ? "bg-red-500 text-white" : daysLeft <= 7 ? "bg-orange-500 text-white" : "bg-amber-100 text-amber-700 border-0 dark:bg-amber-900/40 dark:text-amber-300"}`}
                  >
                    {isExpired ? "Expired" : `${daysLeft}d left`}
                  </Badge>
                </div>
              </div>
            );
          })}
          {items.length > 10 && (
            <p className="text-center text-xs text-muted-foreground py-1">
              +{items.length - 10} more — check Reports → Expired tab
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StockBadge({ stock, reorderPoint }: { stock: number; reorderPoint: number }) {
  if (stock === 0)
    return (
      <Badge variant="destructive" className="text-[10px]">
        Out of Stock
      </Badge>
    );
  if (stock <= Math.ceil(reorderPoint * 0.5))
    return (
      <Badge variant="destructive" className="text-[10px]">
        Critical
      </Badge>
    );
  if (stock <= reorderPoint)
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
      >
        Low
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
      In Stock
    </Badge>
  );
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  online: <Globe className="h-4 w-4 text-blue-500" />,
  pos: <Monitor className="h-4 w-4 text-emerald-500" />,
  marketplace: <Store className="h-4 w-4 text-violet-500" />,
  phone: <Phone className="h-4 w-4 text-orange-500" />,
};

const CHANNEL_COLORS: Record<string, string> = {
  online: "hsl(220 80% 55%)",
  pos: "hsl(142 71% 45%)",
  marketplace: "hsl(265 80% 60%)",
  phone: "hsl(30 90% 55%)",
};

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const [, setLocation] = useLocation();

  const { data: summary, isLoading: summaryLoading } = useGetReportSummary(undefined, {
    query: { refetchInterval: 60_000 },
  });
  const { data: revenueData, isLoading: revenueLoading } = useGetRevenueOverTime(
    { months: 6 },
    {
      query: { refetchInterval: 60_000 },
    },
  );
  const { data: recentSales, isLoading: recentSalesLoading } = useGetRecentSales(
    { limit: 5 },
    {
      query: { refetchInterval: 60_000 },
    },
  );
  const { data: topCustomers } = useGetTopCustomers(
    { limit: 5 },
    { query: { refetchInterval: 60_000 } },
  );
  const { data: topProductsData } = useGetTopProducts(
    { limit: 10 },
    { query: { refetchInterval: 60_000 } },
  );
  const stockParams = { limit: 50 };
  const { data: stockData } = useListProducts(stockParams, {
    query: { queryKey: getListProductsQueryKey(stockParams), refetchInterval: 30000 },
  });
  const lowStockParams = { lowStock: true, limit: 6 };
  const { data: lowStockData } = useListProducts(lowStockParams, {
    query: { queryKey: getListProductsQueryKey(lowStockParams), refetchInterval: 30000 },
  });

  const auditQueryParams = { page: 1, limit: 8 };
  const { data: auditData } = useGetAuditLogs(auditQueryParams, {
    query: { enabled: isAdmin, queryKey: getGetAuditLogsQueryKey(auditQueryParams) },
  });

  const [topPeriod, setTopPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const { devices: posDevices, disconnect: disconnectPosDevice } = usePosConnection(12000);

  const _today = new Date();
  const _defaultStart = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}-01`;
  const _defaultEnd = _today.toISOString().split("T")[0];
  const [dateRange, setDateRange] = useState({ start: _defaultStart, end: _defaultEnd });

  type PurchaseSummary = {
    totalOrders: number;
    totalSpend: number;
    received: number;
    pending: number;
    scope?: "all" | "own";
  };

  const { data: channelRaw } = useQuery({
    queryKey: ["/api/reports/channel-breakdown"],
    queryFn: () => customFetch<ChannelData[]>("/api/reports/channel-breakdown"),
    refetchInterval: 60_000,
  });
  const channelData: ChannelData[] = Array.isArray(channelRaw) ? channelRaw : [];

  const { data: deadStockRaw } = useQuery({
    queryKey: ["/api/reports/dead-stock", { days: 30, threshold: 0 }],
    queryFn: () =>
      customFetch<{ items: DeadStockItem[] }>("/api/reports/dead-stock?days=30&threshold=0"),
    refetchInterval: 60_000,
  });
  const deadStockItems: DeadStockItem[] = (deadStockRaw?.items ?? []).slice(0, 5);

  const { data: purchRaw } = useQuery({
    queryKey: ["/api/reports/purchases", dateRange.start, dateRange.end],
    queryFn: () =>
      customFetch<PurchaseSummary & Record<string, unknown>>(
        `/api/reports/purchases?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      ),
    refetchInterval: 60_000,
  });
  const purchSummary: PurchaseSummary | null =
    purchRaw && typeof purchRaw.totalOrders === "number"
      ? {
          totalOrders: purchRaw.totalOrders,
          totalSpend: purchRaw.totalSpend as number,
          received: purchRaw.received as number,
          pending: purchRaw.pending as number,
          scope: purchRaw.scope as "all" | "own" | undefined,
        }
      : null;

  const allStockProducts = stockData?.data ?? [];
  const totalUnits = allStockProducts.reduce((s, p) => s + p.stock, 0);
  const totalValue = allStockProducts.reduce((s, p) => s + Number(p.price) * p.stock, 0);
  const criticalItems = allStockProducts.filter(
    (p) => p.stock === 0 || p.stock <= Math.ceil(p.reorderPoint * 0.5),
  ).length;
  const lowItems = allStockProducts.filter((p) => {
    const crit = Math.ceil(p.reorderPoint * 0.5);
    return p.stock > crit && p.stock <= p.reorderPoint;
  }).length;

  const totalChannelRevenue = channelData.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="space-y-6">
      {/* Header with date-range filter */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
              Management Dashboard
            </h1>
            <AppVersionBadge />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Overview of your sales &amp; inventory performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border/50 w-full sm:w-auto">
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            Period:
          </span>
          <Input
            id="dashboard-date-start"
            name="dateStart"
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
            className="h-7 text-xs w-full sm:w-32 rounded-lg border-0 bg-background"
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">–</span>
          <Input
            id="dashboard-date-end"
            name="dateEnd"
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
            className="h-7 text-xs w-full sm:w-32 rounded-lg border-0 bg-background"
          />
        </div>
      </div>

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-20 bg-muted rounded mb-2" />
                <div className="h-3 w-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Total Revenue */}
          <Card data-testid="kpi-total-revenue" data-scope={(summary as any).scope ?? "own"}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                Total Revenue
                {(summary as any).scope === "all" && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                    All users
                  </Badge>
                )}
              </CardTitle>
              <span className="h-5 w-5 flex items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-sm">
                ₵
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="kpi-total-revenue-value">
                {GHS(summary.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-500 font-medium">
                  +{summary.revenueGrowth || 0}%
                </span>{" "}
                from last month
              </p>
            </CardContent>
          </Card>

          {/* Purchase Orders */}
          <Card data-testid="kpi-purchase-orders" data-scope={purchSummary?.scope ?? "own"}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                Purchase Orders
                {purchSummary?.scope === "all" && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                    All users
                  </Badge>
                )}
              </CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="kpi-purchase-orders-value">
                {purchSummary?.totalOrders ?? 0}
              </div>
              <p
                className="text-xs text-muted-foreground mt-1"
                data-testid="kpi-purchase-orders-spend"
              >
                {GHS(purchSummary?.totalSpend ?? 0)} spend
                {(purchSummary?.received ?? 0) > 0 && (
                  <>
                    {" "}
                    · <span className="text-green-600">{purchSummary!.received} received</span>
                  </>
                )}
                {(purchSummary?.pending ?? 0) > 0 && (
                  <>
                    {" "}
                    · <span className="text-amber-600">{purchSummary!.pending} pending</span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Total Sales */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{summary.totalSales}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-500 font-medium">
                  +{summary.salesGrowth || 0}%
                </span>{" "}
                from last month
              </p>
            </CardContent>
          </Card>

          {/* Customers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{summary.totalCustomers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                +{summary.newCustomersThisMonth} new this month
              </p>
            </CardContent>
          </Card>

          {/* Pending Sales */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Sales</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingSales}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting fulfilment</p>
            </CardContent>
          </Card>

          {/* Loyalty Members */}
          <Card className="border-violet-100 dark:border-violet-900/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loyalty Members</CardTitle>
              <Star className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">
                {(summary as any).loyaltyMembers ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Customers with points</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Expiry Alerts */}
      <ExpiryAlertPanel />

      {/* Users Transaction Summary */}
      <UsersTransactionSummaryWidget />

      {/* POS Quick Launch + Multichannel Breakdown */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* POS Quick Launch */}
        <Card
          className="relative overflow-hidden border-0 text-white"
          style={{ background: "linear-gradient(135deg, #7B2D42 0%, #1a2b5c 60%, #0D1B3E 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 50%)",
            }}
          />
          <CardHeader className="pb-2 relative z-10">
            <CardTitle className="flex items-center gap-2 text-white text-base">
              <Monitor className="h-4 w-4" /> POS Terminal
            </CardTitle>
            <CardDescription className="text-white/60 text-xs flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${posDevices.length > 0 ? "bg-emerald-400" : "bg-white/30"}`}
                style={
                  posDevices.length > 0
                    ? { animation: "posConnPulse 1.8s ease-in-out infinite" }
                    : {}
                }
              />
              {posDevices.length > 0
                ? `${posDevices.length} device${posDevices.length !== 1 ? "s" : ""} connected`
                : "No devices connected"}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-white/60 text-xs mb-1">POS Sales</p>
                <p className="text-xl font-bold">
                  {channelData.find((c) => c.channel === "pos")?.totalSales ?? 0}
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-white/60 text-xs mb-1">POS Revenue</p>
                <p className="text-sm font-bold">
                  {GHS(channelData.find((c) => c.channel === "pos")?.revenue ?? 0)}
                </p>
              </div>
            </div>

            {/* Connected POS devices list */}
            {posDevices.length > 0 && (
              <div className="bg-white/8 rounded-xl p-2 space-y-1.5 max-h-28 overflow-y-auto">
                {posDevices.map((device) => (
                  <div key={device.id} className="flex items-center gap-2 px-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                      style={{ animation: "posConnPulse 2s ease-in-out infinite" }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">{device.name}</span>
                      <span className="text-[10px] text-white/50 capitalize">
                        {device.deviceType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <button
                      onClick={() => disconnectPosDevice(device.id)}
                      className="text-white/40 hover:text-white/80 transition-colors p-0.5 rounded"
                      title="Disconnect"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={() => setLocation("/pos")}
              className="w-full bg-white text-[#7B2D42] hover:bg-white/90 rounded-full font-semibold gap-2"
              size="sm"
            >
              <Zap className="h-4 w-4" /> Launch POS Terminal
            </Button>
          </CardContent>
        </Card>

        {/* Multichannel Sales Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" /> Multichannel Sales
            </CardTitle>
            <CardDescription>Revenue breakdown by selling channel</CardDescription>
          </CardHeader>
          <CardContent>
            {channelData.length > 0 ? (
              <div className="space-y-3">
                {channelData.map((c) => {
                  const pct = totalChannelRevenue > 0 ? (c.revenue / totalChannelRevenue) * 100 : 0;
                  const color = CHANNEL_COLORS[c.channel] ?? "hsl(var(--primary))";
                  return (
                    <div key={c.channel} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {CHANNEL_ICONS[c.channel] ?? (
                            <Store className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium capitalize">{c.channel}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {c.totalSales} sales
                          </Badge>
                        </div>
                        <span className="font-semibold text-xs">{GHS(c.revenue)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground border rounded-lg border-dashed text-sm">
                No multichannel data yet — sales will appear here once recorded
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart + Recent Sales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Revenue over the last 6 months (GHS ₵)</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <div className="h-[280px] bg-muted animate-pulse rounded-lg" />
            ) : revenueData && revenueData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(v) => `₵${v}`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => [GHS(v), "Revenue"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#revGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground border rounded-lg border-dashed">
                No revenue data available yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Latest transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSalesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                      <div className="h-2 bg-muted rounded w-1/3 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentSales && recentSales.length > 0 ? (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                        {sale.customerName?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">{sale.customerName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground">{sale.invoiceNumber}</p>
                          {(sale as unknown as { channel?: string }).channel &&
                            (sale as unknown as { channel?: string }).channel !== "online" && (
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 capitalize">
                                {(sale as unknown as { channel?: string }).channel}
                              </Badge>
                            )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{GHS(sale.total)}</span>
                      <Badge
                        variant={
                          sale.status === "completed"
                            ? "default"
                            : sale.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-[10px] px-1.5 h-4"
                      >
                        {sale.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">No recent sales</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top-Selling Products + Real-Time Stock Control */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" /> Top-Selling Products
                </CardTitle>
                <CardDescription>Revenue by period</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={topPeriod} onValueChange={(v) => setTopPeriod(v as typeof topPeriod)}>
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="daily" className="flex-1">
                  Daily
                </TabsTrigger>
                <TabsTrigger value="weekly" className="flex-1">
                  Weekly
                </TabsTrigger>
                <TabsTrigger value="monthly" className="flex-1">
                  Monthly
                </TabsTrigger>
              </TabsList>
              <TabsContent value={topPeriod}>
                {topProductsData && topProductsData.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height={200} minWidth={0}>
                      <BarChart
                        data={topProductsData.slice(0, 5)}
                        layout="vertical"
                        margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                          tickFormatter={(v) => `₵${v}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                          width={80}
                        />
                        <Tooltip
                          formatter={(v: number) => [GHS(v), PERIOD_LABELS[topPeriod]]}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid hsl(var(--border))",
                          }}
                        />
                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                          {topProductsData.slice(0, 5).map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={`hsl(${265 - idx * 18}, 80%, ${55 + idx * 5}%)`}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground border rounded-lg border-dashed">
                    No product data for {PERIOD_LABELS[topPeriod].toLowerCase()}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Real-Time Stock Control Panel */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-primary" /> Real-Time Stock Levels
              </CardTitle>
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <CardDescription>Live inventory — refreshes every 30 seconds</CardDescription>
          </CardHeader>
          <CardContent>
            {allStockProducts.length > 0 ? (
              <div className="space-y-3">
                {allStockProducts.slice(0, 6).map((p) => {
                  const maxForBar = Math.max(p.reorderPoint * 3, p.stock, 1);
                  const pct = Math.min((p.stock / maxForBar) * 100, 100);
                  const isCritical = p.stock === 0 || p.stock <= Math.ceil(p.reorderPoint * 0.5);
                  const isLow = !isCritical && p.stock <= p.reorderPoint;
                  const barColor = isCritical
                    ? "bg-red-500"
                    : isLow
                      ? "bg-amber-400"
                      : "bg-emerald-500";
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[180px]">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground tabular-nums text-xs">
                            {p.stock} units
                          </span>
                          <StockBadge stock={p.stock} reorderPoint={p.reorderPoint} />
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground border rounded-lg border-dashed">
                No inventory data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Warehouse Stats + Reorder Alerts + Audit Tray */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Warehouse className="h-4 w-4 text-primary" /> Warehouse Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Total Units</span>
              </div>
              <span className="font-bold text-lg">{totalUnits.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Inventory Value</span>
              </div>
              <span className="font-bold text-sm">{GHS(totalValue)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  Critical Stock
                </span>
              </div>
              <span className="font-bold text-red-600">{criticalItems} items</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Low Stock
                </span>
              </div>
              <span className="font-bold text-amber-600">{lowItems} items</span>
            </div>
          </CardContent>
        </Card>

        {/* Reorder Alerts Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-amber-500" /> Reorder Alerts
            </CardTitle>
            <CardDescription>Products needing restocking</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStockData && lowStockData.total > 0 ? (
              <div className="space-y-2">
                {lowStockData.data.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.stock === 0 ? "Out of stock" : `${p.stock} remaining`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0 text-[10px] shrink-0">
                        Reorder
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full"
                        onClick={() => setLocation("/purchases")}
                        title="Create Purchase Order"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
                {lowStockData.total > lowStockData.data.length && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{lowStockData.total - lowStockData.data.length} more items need attention
                  </p>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground border rounded-lg border-dashed text-sm">
                All products are well-stocked
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit Tray */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" /> Audit Tray
            </CardTitle>
            <CardDescription>Recent system activity</CardDescription>
          </CardHeader>
          <CardContent>
            {auditData?.data && auditData.data.length > 0 ? (
              <div className="space-y-2">
                {auditData.data.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-mono">
                          {log.action}
                        </Badge>
                        <span className="text-xs font-medium truncate">{auditDetailText(log)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {log.resource ?? log.entityName ?? log.entityType ?? "Audit log"} ·{" "}
                        {new Date(log.createdAt).toLocaleString("en-GH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground border rounded-lg border-dashed">
                No recent activity recorded
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dead Stock Panel */}
      {deadStockItems.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-500" /> Dead Stock Alert
              </CardTitle>
              <CardDescription>
                Products with zero sales in the last 30 days — cash flow risk
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => setLocation("/reports")}
            >
              Full Analysis
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {deadStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30"
                >
                  <div className="h-9 w-9 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.stock} units · {GHS(item.stockValue)}
                    </p>
                  </div>
                  <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border-0 text-[10px] shrink-0">
                    Dead
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Customers */}
      {topCustomers && topCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
            <CardDescription>Customers generating the most revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="grid grid-cols-4 p-4 border-b font-medium text-sm text-muted-foreground">
                <div className="col-span-2">Customer</div>
                <div>Orders</div>
                <div className="text-right">Total Spend</div>
              </div>
              {topCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="grid grid-cols-4 p-4 border-b last:border-0 items-center text-sm"
                >
                  <div className="col-span-2 font-medium">{customer.name}</div>
                  <div>{customer.totalOrders}</div>
                  <div className="text-right font-medium">{GHS(customer.totalSpend)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && <SmokeTestPanel />}
    </div>
  );
}
