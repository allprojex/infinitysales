// @ts-nocheck
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Package,
  Users,
  ShieldAlert,
  Tag,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  BarChart3,
  Star,
  Zap,
  ChevronDown,
  Download,
  Printer,
  FileText,
  FileSpreadsheet,
  Trophy,
  Leaf,
  Banknote,
  Truck,
  Archive,
  RotateCcw,
  Info,
  X,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(v || 0);

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v || 0).toFixed(1)}%`;

type Urgency = "critical" | "high" | "medium";
type Risk = "high" | "medium" | "low";
type Trend = "growing" | "stable" | "declining";
type Confidence = "high" | "medium" | "low";
type CashTrend = "positive" | "neutral" | "negative";
type TurnoverStatus = "fast" | "normal" | "slow";

interface AIInsights {
  salesForecast: {
    next7DaysRevenue: number;
    next30DaysRevenue: number;
    confidence: Confidence;
    trend: Trend;
    trendPercent: number;
    keyDrivers: string[];
    weeklyBreakdown?: { week: string; projectedRevenue: number; notes: string }[];
    recommendations: string[];
  };
  inventoryPrediction: {
    criticalItems: {
      name: string;
      currentStock: number;
      daysUntilStockout: number;
      urgency: Urgency;
    }[];
    reorderSuggestions: {
      name: string;
      suggestedQty: number;
      reason: string;
      estimatedCost?: number;
    }[];
    expiryRisks: { name: string; expiryDate: string; stock: number; action: string }[];
    recommendations: string[];
  };
  productRankings: {
    topByRevenue: { name: string; revenue: number; units: number; rank: number }[];
    bottomPerformers: { name: string; revenue: number; units: number; reason: string }[];
    fastMovers: { name: string; insight: string }[];
    slowMovers: { name: string; stock: number; recommendation: string }[];
    recommendations: string[];
  };
  inventoryTurnover: {
    overallTurnoverRate: number;
    byCategory: {
      category: string;
      turnoverRate: number;
      avgDaysInStock: number;
      status: TurnoverStatus;
    }[];
    recommendations: string[];
  };
  stockAging: {
    agedItems: { name: string; estimatedDaysInStock: number; stock: number; action: string }[];
    totalAgedValue: number;
    recommendations: string[];
  };
  profitabilityAnalysis: {
    overallGrossMarginPct: number;
    byCategory: { category: string; revenue: number; estimatedProfit: number; marginPct: number }[];
    highestMarginCategory: string;
    lowestMarginCategory: string;
    recommendations: string[];
  };
  seasonalDemand: {
    currentSeason: string;
    upcomingEvents: {
      event: string;
      timing: string;
      expectedImpact: string;
      productsToStock: string[];
    }[];
    demandForecast: string;
    recommendations: string[];
  };
  customerPatterns: {
    topSegment: string;
    averageOrderValue: number;
    peakShoppingHours: string[];
    loyaltyInsights: string;
    churnRisk: string;
    paymentMethodInsights?: string;
    recommendations: string[];
  };
  pricingRecommendations: {
    items: {
      name: string;
      currentPrice: number;
      suggestedPrice: number;
      rationale: string;
      expectedImpact: string;
    }[];
    overallStrategy: string;
    recommendations: string[];
  };
  cashFlow: {
    estimatedMonthlyRevenue: number;
    estimatedMonthlyCOGS: number;
    estimatedGrossProfit: number;
    projectedNextMonth: number;
    cashFlowTrend: CashTrend;
    keyRisks: string[];
    recommendations: string[];
  };
  supplierPerformance: {
    overallInsight: string;
    supplierRecommendations: { supplier: string; insight: string; action: string }[];
    categoriesNeedingAttention: string[];
    recommendations: string[];
  };
  fraudAlerts: {
    riskLevel: Risk;
    flaggedTransactions: { id: number; amount: number; reason: string; date: string }[];
    patterns: string[];
    recommendations: string[];
  };
  executiveSummary: string;
}

interface InsightsResponse {
  insights: AIInsights;
  meta: {
    generatedAt: string;
    dataWindow: string;
    transactionCount: number;
    currentRevenue: number;
    prevRevenue: number;
    revenueGrowth: number;
    suspiciousTxCount: number;
    totalProducts?: number;
    topProductsByRevenue?: { name: string; revenue: number; units: number }[];
    categoryPerformance?: {
      category: string;
      revenue: number;
      estimatedCost: number;
      units: number;
      grossMarginPct: number;
    }[];
  };
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const map: Record<Confidence, { label: string; cls: string }> = {
    high: {
      label: "High Confidence",
      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    medium: {
      label: "Medium Confidence",
      cls: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    },
    low: { label: "Low Confidence", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const { label, cls } = map[level] ?? map.medium;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

function RiskBadge({ level }: { level: Risk }) {
  const map: Record<Risk, { label: string; cls: string }> = {
    high: { label: "High Risk", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    medium: { label: "Medium Risk", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    low: { label: "Low Risk", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  };
  const { label, cls } = map[level] ?? map.medium;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

function UrgencyBadge({ level }: { level: Urgency }) {
  const map: Record<Urgency, { label: string; cls: string }> = {
    critical: { label: "Critical", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    high: { label: "High", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    medium: { label: "Medium", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  };
  const { label, cls } = map[level] ?? map.medium;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "growing") return <TrendingUp className="h-5 w-5 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="h-5 w-5 text-red-400" />;
  return <Minus className="h-5 w-5 text-amber-400" />;
}

function RecommendationList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {(items ?? []).map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionExportDropdown({ exports }: { exports: { label: string; handler: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="flex items-center gap-1 px-2.5 py-1.5 mr-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg border border-transparent hover:border-border transition-all"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Export this section"
      >
        <Download className="h-3 w-3" />
        <span className="hidden sm:inline font-medium">Export</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute right-2 top-full mt-1 z-50 min-w-[140px] rounded-lg border bg-card shadow-lg py-1"
          onMouseLeave={() => setOpen(false)}
        >
          {exports.map((ex, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 text-foreground"
              onClick={(ev) => {
                ev.stopPropagation();
                ex.handler();
                setOpen(false);
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
  badge,
  sectionExports,
}: {
  title: string;
  icon: React.ReactNode;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  sectionExports?: { label: string; handler: () => void }[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card print-section">
      <div className="flex items-center print:hidden">
        <button
          type="button"
          className="flex-1 flex items-center justify-between p-4 hover:bg-muted/20 transition-colors rounded-l-xl text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0">{icon}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{title}</span>
              {badge}
            </div>
            {summary && (
              <div className="text-xs text-muted-foreground hidden sm:block">{summary}</div>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-2 ${open ? "rotate-180" : ""}`}
          />
        </button>
        {sectionExports && sectionExports.length > 0 && (
          <SectionExportDropdown exports={sectionExports} />
        )}
      </div>
      {open && <div className="border-t p-4 space-y-4 print-content">{children}</div>}
    </div>
  );
}

function DrillDownTable({
  label,
  headers,
  rows,
}: {
  label: string;
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  return (
    <div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 5 && (
        <button
          type="button"
          className="mt-2 text-xs text-primary hover:text-primary/80 flex items-center gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3 rotate-180" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Show all {rows.length} {label}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function KPIStrip({ meta }: { meta: InsightsResponse["meta"] }) {
  const kpis = [
    {
      label: "30-Day Revenue",
      value: GHS(meta.currentRevenue),
      sub:
        meta.revenueGrowth >= 0 ? (
          <span className="text-emerald-400">{pct(meta.revenueGrowth)} vs last period</span>
        ) : (
          <span className="text-red-400">{pct(meta.revenueGrowth)} vs last period</span>
        ),
      icon: <Banknote className="h-4 w-4 text-emerald-400" />,
    },
    {
      label: "Transactions",
      value: meta.transactionCount.toLocaleString(),
      sub: <span className="text-muted-foreground">completed sales</span>,
      icon: <BarChart3 className="h-4 w-4 text-blue-400" />,
    },
    {
      label: "Avg Order Value",
      value: meta.transactionCount > 0 ? GHS(meta.currentRevenue / meta.transactionCount) : "—",
      sub: <span className="text-muted-foreground">per transaction</span>,
      icon: <Tag className="h-4 w-4 text-violet-400" />,
    },
    {
      label: "Prev Period",
      value: GHS(meta.prevRevenue),
      sub: <span className="text-muted-foreground">30-day comparison</span>,
      icon: <Clock className="h-4 w-4 text-amber-400" />,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map((k, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {k.label}
              </p>
              {k.icon}
            </div>
            <p className="text-lg font-bold leading-tight">{k.value}</p>
            <div className="text-xs mt-0.5">{k.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SalesForecastSection({
  data,
  meta,
}: {
  data: AIInsights["salesForecast"];
  meta: InsightsResponse["meta"];
}) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const weeklyData = data.weeklyBreakdown ?? [];
  const chartData = weeklyData.map((w) => ({
    name: w.week,
    revenue: w.projectedRevenue,
    notes: w.notes,
  }));
  const selectedWeekData = chartData.find((d) => d.name === selectedWeek);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              7-Day Forecast
            </p>
            <p className="text-2xl font-bold">{GHS(data.next7DaysRevenue)}</p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <TrendIcon trend={data.trend} />
              <span
                className={`text-xs font-medium ${data.trend === "growing" ? "text-emerald-400" : data.trend === "declining" ? "text-red-400" : "text-amber-400"}`}
              >
                {pct(data.trendPercent)}
              </span>
              <ConfidenceBadge level={data.confidence} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              30-Day Forecast
            </p>
            <p className="text-2xl font-bold">{GHS(data.next30DaysRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {meta.transactionCount} transactions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Revenue Growth
            </p>
            <div className="flex items-center gap-2">
              {meta.revenueGrowth >= 0 ? (
                <ArrowUpRight className="h-5 w-5 text-emerald-400" />
              ) : (
                <ArrowDownRight className="h-5 w-5 text-red-400" />
              )}
              <p
                className={`text-2xl font-bold ${meta.revenueGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {pct(meta.revenueGrowth)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs previous 30 days</p>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Weekly Revenue Projection</CardTitle>
              <p className="text-xs text-muted-foreground">Click a bar for details</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(v: number) => [GHS(v), "Projected"]} />
                <Bar
                  dataKey="revenue"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry: { name: string }) =>
                    setSelectedWeek((prev) => (prev === entry.name ? null : entry.name))
                  }
                >
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.name === selectedWeek ? "hsl(var(--primary))" : "hsl(var(--primary)/0.6)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {selectedWeekData && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-primary">
                    {selectedWeekData.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedWeek(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                  <div>
                    <p className="text-muted-foreground">Projected Revenue</p>
                    <p className="font-bold text-base">{GHS(selectedWeekData.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Trend</p>
                    <p className="font-medium capitalize">
                      {data.trend} ({pct(data.trendPercent)})
                    </p>
                  </div>
                </div>
                {selectedWeekData.notes && (
                  <p className="text-xs text-muted-foreground">{selectedWeekData.notes}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Key Growth Drivers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(data.keyDrivers ?? []).map((d, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                {d}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProductRankingsSection({
  data,
  meta,
}: {
  data: AIInsights["productRankings"];
  meta: InsightsResponse["meta"];
}) {
  const topRows = (meta.topProductsByRevenue ?? data.topByRevenue ?? [])
    .slice(0, 20)
    .map((p, i) => [
      <span className="font-medium text-muted-foreground">#{i + 1}</span>,
      <span className="font-medium">{p.name}</span>,
      <span className="font-semibold text-emerald-400">{GHS(p.revenue)}</span>,
      p.units.toLocaleString(),
    ]);
  const bottomRows = (data.bottomPerformers ?? []).map((p) => [
    p.name,
    GHS(p.revenue),
    p.units.toLocaleString(),
    <span className="text-muted-foreground">{p.reason}</span>,
  ]);
  return (
    <div className="space-y-4">
      {topRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-400" /> Top Products by Revenue
          </p>
          <DrillDownTable
            label="products"
            headers={["#", "Product", "Revenue", "Units Sold"]}
            rows={topRows}
          />
        </div>
      )}
      {(data.fastMovers ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" /> Fast Movers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.fastMovers.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-muted-foreground">— {p.insight}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {(data.slowMovers ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Archive className="h-4 w-4 text-orange-400" /> Slow Movers — Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.slowMovers.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20"
                >
                  <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-muted-foreground text-xs">(Stock: {p.stock})</span>{" "}
                    <span className="text-muted-foreground">— {p.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {bottomRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Bottom Performers
          </p>
          <DrillDownTable
            label="products"
            headers={["Product", "Revenue", "Units", "Issue"]}
            rows={bottomRows}
          />
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryHealthSection({ data }: { data: AIInsights["inventoryPrediction"] }) {
  return (
    <div className="space-y-4">
      {(data.criticalItems ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" /> Critical Stock Levels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.criticalItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      <UrgencyBadge level={item.urgency} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Stock: {item.currentStock} units</span>
                      <span>~{item.daysUntilStockout} days left</span>
                    </div>
                    <Progress
                      value={Math.min((item.daysUntilStockout / 30) * 100, 100)}
                      className="h-1.5 mt-1.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {(data.reorderSuggestions ?? []).length > 0 && (
        <DrillDownTable
          label="reorder suggestions"
          headers={["Product", "Order Qty", "Est. Cost", "Reason"]}
          rows={data.reorderSuggestions.map((r) => [
            r.name,
            `${r.suggestedQty} units`,
            r.estimatedCost ? GHS(r.estimatedCost) : "—",
            <span className="text-muted-foreground">{r.reason}</span>,
          ])}
        />
      )}
      {(data.expiryRisks ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" /> Expiry Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.expiryRisks.map((item, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/20"
                >
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires: {item.expiryDate} · {item.stock} units
                  </p>
                  <p className="text-xs text-orange-400 mt-0.5">{item.action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function TurnoverSection({
  data,
  meta,
}: {
  data: AIInsights["inventoryTurnover"];
  meta: InsightsResponse["meta"];
}) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const catData = (meta.categoryPerformance ?? data.byCategory ?? []).slice(0, 10);
  const chartData = catData.map((c) => ({
    name: "category" in c ? (c as { category: string }).category : "",
    value: "revenue" in c ? (c as { revenue: number }).revenue : 0,
    units: "units" in c ? (c as { units: number }).units : 0,
    grossMarginPct: "grossMarginPct" in c ? (c as { grossMarginPct: number }).grossMarginPct : 0,
  }));
  const selectedData = chartData.find((d) => d.name === selectedCat);
  const turnoverForCat = selectedCat
    ? (data.byCategory ?? []).find((c) => c.category === selectedCat)
    : null;
  const statusColor: Record<TurnoverStatus, string> = {
    fast: "text-emerald-400",
    normal: "text-blue-400",
    slow: "text-orange-400",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
            Overall Turnover Rate
          </p>
          <p className="text-2xl font-bold">{(data.overallTurnoverRate ?? 0).toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground mt-0.5">per 30-day period</p>
        </CardContent>
      </Card>
      {(data.byCategory ?? []).length > 0 && (
        <DrillDownTable
          label="categories"
          headers={["Category", "Turnover Rate", "Avg Days in Stock", "Status"]}
          rows={data.byCategory.map((c) => [
            c.category,
            `${(c.turnoverRate ?? 0).toFixed(2)}x`,
            `${c.avgDaysInStock ?? 0} days`,
            <span className={`font-medium ${statusColor[c.status] ?? "text-muted-foreground"}`}>
              {c.status}
            </span>,
          ])}
        />
      )}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Revenue by Category</CardTitle>
              <p className="text-xs text-muted-foreground">Click a bar for details</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResponsiveContainer width="100%" height={Math.max(150, chartData.length * 28)}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`}
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                <Tooltip formatter={(v: number) => [GHS(v), "Revenue"]} />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: { name: string }) =>
                    setSelectedCat((prev) => (prev === entry.name ? null : entry.name))
                  }
                >
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.name === selectedCat ? "hsl(var(--primary))" : "hsl(var(--primary)/0.55)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {selectedData && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-primary">{selectedData.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCat(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Revenue</p>
                    <p className="font-bold">{GHS(selectedData.value)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Units Sold</p>
                    <p className="font-bold">{selectedData.units.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Gross Margin</p>
                    <p className="font-bold">{selectedData.grossMarginPct.toFixed(1)}%</p>
                  </div>
                  {turnoverForCat && (
                    <div>
                      <p className="text-muted-foreground">Turnover Rate</p>
                      <p className={`font-bold ${statusColor[turnoverForCat.status] ?? ""}`}>
                        {(turnoverForCat.turnoverRate ?? 0).toFixed(2)}x ({turnoverForCat.status})
                      </p>
                    </div>
                  )}
                </div>
                {(meta.topProductsByRevenue ?? []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-primary/20">
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Overall top products for reference:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {(meta.topProductsByRevenue ?? []).slice(0, 4).map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate mr-2">{p.name}</span>
                          <span className="font-medium shrink-0">{GHS(p.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function StockAgingSection({ data }: { data: AIInsights["stockAging"] }) {
  return (
    <div className="space-y-4">
      {(data.totalAgedValue ?? 0) > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Estimated Aged Stock Value
            </p>
            <p className="text-2xl font-bold text-orange-400">{GHS(data.totalAgedValue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capital tied up in slow-moving inventory
            </p>
          </CardContent>
        </Card>
      )}
      {(data.agedItems ?? []).length > 0 && (
        <DrillDownTable
          label="aged items"
          headers={["Product", "Est. Days in Stock", "Stock", "Recommended Action"]}
          rows={data.agedItems.map((i) => [
            i.name,
            `${i.estimatedDaysInStock} days`,
            i.stock,
            <span className="text-orange-400 text-xs">{i.action}</span>,
          ])}
        />
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfitabilitySection({ data }: { data: AIInsights["profitabilityAnalysis"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Gross Margin
            </p>
            <p className="text-2xl font-bold">{(data.overallGrossMarginPct ?? 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Highest Margin
            </p>
            <p className="text-sm font-bold text-emerald-400">
              {data.highestMarginCategory ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Needs Attention
            </p>
            <p className="text-sm font-bold text-red-400">{data.lowestMarginCategory ?? "—"}</p>
          </CardContent>
        </Card>
      </div>
      {(data.byCategory ?? []).length > 0 && (
        <DrillDownTable
          label="categories"
          headers={["Category", "Revenue", "Est. Profit", "Margin %"]}
          rows={data.byCategory.map((c) => [
            c.category,
            GHS(c.revenue),
            <span
              className={
                c.estimatedProfit >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"
              }
            >
              {GHS(c.estimatedProfit)}
            </span>,
            <span
              className={
                c.marginPct >= 20
                  ? "text-emerald-400"
                  : c.marginPct >= 10
                    ? "text-amber-400"
                    : "text-red-400"
              }
            >
              {c.marginPct.toFixed(1)}%
            </span>,
          ])}
        />
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function SeasonalSection({ data }: { data: AIInsights["seasonalDemand"] }) {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1">
            <Leaf className="h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Current Season
            </p>
          </div>
          <p className="text-lg font-bold">{data.currentSeason ?? "—"}</p>
          <p className="text-sm text-muted-foreground mt-1">{data.demandForecast}</p>
        </CardContent>
      </Card>
      {(data.upcomingEvents ?? []).length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Upcoming Events & Demand Spikes
          </p>
          {data.upcomingEvents.map((e, i) => (
            <Card key={i}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm">{e.event}</span>
                  <span className="text-xs text-muted-foreground">{e.timing}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{e.expectedImpact}</p>
                {(e.productsToStock ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {e.productsToStock.map((p, j) => (
                      <span
                        key={j}
                        className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function CustomerSection({ data }: { data: AIInsights["customerPatterns"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Top Segment
            </p>
            <p className="text-xl font-bold">{data.topSegment}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              Avg Order Value
            </p>
            <p className="text-2xl font-bold">{GHS(data.averageOrderValue)}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Peak Shopping Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(data.peakShoppingHours ?? []).map((h, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                {h}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" /> Loyalty & Retention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{data.loyaltyInsights}</p>
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <p className="text-xs font-medium text-amber-400 mb-1">Churn Risk</p>
            <p className="text-sm text-muted-foreground">{data.churnRisk}</p>
          </div>
          {data.paymentMethodInsights && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs font-medium text-blue-400 mb-1">
                Payment Methods (MoMo/Cash insights)
              </p>
              <p className="text-sm text-muted-foreground">{data.paymentMethodInsights}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function PricingSection({ data }: { data: AIInsights["pricingRecommendations"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Overall Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.overallStrategy}</p>
        </CardContent>
      </Card>
      {(data.items ?? []).length > 0 && (
        <DrillDownTable
          label="price adjustments"
          headers={["Product", "Current", "Suggested", "Impact"]}
          rows={data.items.map((item) => {
            const diff = item.suggestedPrice - item.currentPrice;
            const p = item.currentPrice > 0 ? (diff / item.currentPrice) * 100 : 0;
            return [
              item.name,
              GHS(item.currentPrice),
              <span className="font-bold text-primary">
                {GHS(item.suggestedPrice)}{" "}
                <span className={`text-xs ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  ({pct(p)})
                </span>
              </span>,
              <span className="text-xs text-muted-foreground">{item.rationale}</span>,
            ];
          })}
        />
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function CashFlowSection({ data }: { data: AIInsights["cashFlow"] }) {
  const trendColor: Record<CashTrend, string> = {
    positive: "text-emerald-400",
    neutral: "text-amber-400",
    negative: "text-red-400",
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Monthly Revenue",
            value: GHS(data.estimatedMonthlyRevenue),
            cls: "text-emerald-400",
          },
          { label: "Est. COGS", value: GHS(data.estimatedMonthlyCOGS), cls: "text-red-400" },
          { label: "Gross Profit", value: GHS(data.estimatedGrossProfit), cls: "text-primary" },
          {
            label: "Projected Next Month",
            value: GHS(data.projectedNextMonth),
            cls: trendColor[data.cashFlowTrend] ?? "text-foreground",
          },
        ].map((k, i) => (
          <Card key={i}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">{k.label}</p>
              <p className={`text-base font-bold ${k.cls}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {(data.keyRisks ?? []).length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Key Cash Flow Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {data.keyRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" /> {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function SupplierSection({ data }: { data: AIInsights["supplierPerformance"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.overallInsight}</p>
        </CardContent>
      </Card>
      {(data.categoriesNeedingAttention ?? []).length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" /> Categories Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.categoriesNeedingAttention.map((c, i) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {(data.supplierRecommendations ?? []).length > 0 && (
        <DrillDownTable
          label="supplier insights"
          headers={["Supplier", "Insight", "Recommended Action"]}
          rows={data.supplierRecommendations.map((s) => [
            s.supplier,
            <span className="text-muted-foreground text-xs">{s.insight}</span>,
            <span className="text-primary text-xs">{s.action}</span>,
          ])}
        />
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function FraudSection({ data }: { data: AIInsights["fraudAlerts"] }) {
  return (
    <div className="space-y-4">
      <Card
        className={
          data.riskLevel === "high"
            ? "border-red-500/40 bg-red-500/5"
            : data.riskLevel === "medium"
              ? "border-amber-500/40 bg-amber-500/5"
              : ""
        }
      >
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                Overall Risk Level
              </p>
              <RiskBadge level={data.riskLevel} />
            </div>
            <ShieldAlert
              className={`h-8 w-8 ${data.riskLevel === "high" ? "text-red-400" : data.riskLevel === "medium" ? "text-amber-400" : "text-emerald-400"}`}
            />
          </div>
        </CardContent>
      </Card>
      {(data.flaggedTransactions ?? []).length > 0 && (
        <DrillDownTable
          label="flagged transactions"
          headers={["Tx #", "Amount", "Reason", "Date"]}
          rows={data.flaggedTransactions.map((tx) => [
            <span className="font-mono text-muted-foreground">#{tx.id}</span>,
            <span className="font-bold text-red-400">{GHS(tx.amount)}</span>,
            tx.reason,
            new Date(tx.date).toLocaleDateString("en-GH"),
          ])}
        />
      )}
      {(data.patterns ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Detected Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.patterns.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={data.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportToExcel(data: InsightsResponse) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Infinity BI";
  wb.created = new Date();

  const addSheet = (name: string, headers: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
    });
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((col) => {
      col.width = 20;
    });
    return ws;
  };

  const ins = data.insights;
  const meta = data.meta;

  addSheet(
    "Summary",
    ["Metric", "Value"],
    [
      ["Report Generated", new Date(meta.generatedAt).toLocaleString("en-GH")],
      ["Data Window", meta.dataWindow],
      ["Total Transactions", meta.transactionCount],
      ["Current Revenue (GHS)", meta.currentRevenue.toFixed(2)],
      ["Previous Revenue (GHS)", meta.prevRevenue.toFixed(2)],
      ["Revenue Growth %", meta.revenueGrowth.toFixed(2)],
      ["7-Day Forecast (GHS)", (ins.salesForecast?.next7DaysRevenue ?? 0).toFixed(2)],
      ["30-Day Forecast (GHS)", (ins.salesForecast?.next30DaysRevenue ?? 0).toFixed(2)],
      ["Gross Margin %", (ins.profitabilityAnalysis?.overallGrossMarginPct ?? 0).toFixed(2)],
      ["Fraud Risk Level", ins.fraudAlerts?.riskLevel ?? "unknown"],
      ["Executive Summary", ins.executiveSummary ?? ""],
    ],
  );

  const topProds = meta.topProductsByRevenue ?? ins.productRankings?.topByRevenue ?? [];
  if (topProds.length > 0) {
    addSheet(
      "Product Rankings",
      ["Rank", "Product", "Revenue (GHS)", "Units Sold"],
      topProds.map((p, i) => [i + 1, p.name, Number(p.revenue.toFixed(2)), p.units]),
    );
  }

  const cats = meta.categoryPerformance ?? ins.profitabilityAnalysis?.byCategory ?? [];
  if (cats.length > 0) {
    addSheet(
      "Profitability by Category",
      ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
      cats.map((c) => [
        "category" in c ? (c as { category: string }).category : "",
        Number(("revenue" in c ? (c as { revenue: number }).revenue : 0).toFixed(2)),
        Number(
          ("estimatedProfit" in c
            ? (c as { estimatedProfit: number }).estimatedProfit
            : "estimatedCost" in c
              ? (c as { revenue: number; estimatedCost: number }).revenue -
                (c as { estimatedCost: number }).estimatedCost
              : 0
          ).toFixed(2),
        ),
        Number(
          ("marginPct" in c
            ? (c as { marginPct: number }).marginPct
            : "grossMarginPct" in c
              ? (c as { grossMarginPct: number }).grossMarginPct
              : 0
          ).toFixed(2),
        ),
      ]),
    );
  }

  if ((ins.inventoryPrediction?.reorderSuggestions ?? []).length > 0) {
    addSheet(
      "Reorder Suggestions",
      ["Product", "Qty to Order", "Est. Cost (GHS)", "Reason"],
      ins.inventoryPrediction.reorderSuggestions.map((r) => [
        r.name,
        r.suggestedQty,
        r.estimatedCost ?? 0,
        r.reason,
      ]),
    );
  }

  if ((ins.inventoryPrediction?.criticalItems ?? []).length > 0) {
    addSheet(
      "Critical Stock",
      ["Product", "Current Stock", "Days Until Stockout", "Urgency"],
      ins.inventoryPrediction.criticalItems.map((i) => [
        i.name,
        i.currentStock,
        i.daysUntilStockout,
        i.urgency,
      ]),
    );
  }

  if ((ins.pricingRecommendations?.items ?? []).length > 0) {
    addSheet(
      "Pricing Recommendations",
      ["Product", "Current Price (GHS)", "Suggested Price (GHS)", "Rationale", "Expected Impact"],
      ins.pricingRecommendations.items.map((i) => [
        i.name,
        i.currentPrice,
        i.suggestedPrice,
        i.rationale,
        i.expectedImpact,
      ]),
    );
  }

  if ((ins.fraudAlerts?.flaggedTransactions ?? []).length > 0) {
    addSheet(
      "Flagged Transactions",
      ["Tx #", "Amount (GHS)", "Reason", "Date"],
      ins.fraudAlerts.flaggedTransactions.map((t) => [
        t.id,
        t.amount,
        t.reason,
        new Date(t.date).toLocaleString("en-GH"),
      ]),
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `infinity-bi-report-${new Date().toISOString().split("T")[0]}.xlsx`,
  );
}

async function exportToPDF(data: InsightsResponse) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const ins = data.insights;
  const meta = data.meta;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 20;

  const addHeading = (text: string, size = 13) => {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 95);
    doc.text(text, 14, y);
    y += size === 13 ? 7 : 10;
    doc.setTextColor(0);
  };
  const addBody = (text: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, 182);
    if (y + lines.length * 4.5 > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 3;
  };
  const addTable = (
    head: string[],
    body: string[][],
    color: [number, number, number] = [30, 58, 95],
  ) => {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: color, textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 95);
  doc.text("Infinity Business Intelligence Report", 105, y, { align: "center" });
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(
    `Generated: ${new Date(meta.generatedAt).toLocaleString("en-GH")}  |  Data Window: ${meta.dataWindow}`,
    105,
    y,
    { align: "center" },
  );
  y += 10;
  doc.setTextColor(0);

  addHeading("Executive Summary");
  addBody(ins.executiveSummary ?? "");

  addHeading("Key Metrics");
  addTable(
    ["Metric", "Value"],
    [
      ["Current Revenue (GHS)", meta.currentRevenue.toFixed(2)],
      ["Previous Revenue (GHS)", meta.prevRevenue.toFixed(2)],
      ["Revenue Growth %", `${meta.revenueGrowth.toFixed(2)}%`],
      ["Total Transactions", String(meta.transactionCount)],
      ["7-Day Forecast (GHS)", (ins.salesForecast?.next7DaysRevenue ?? 0).toFixed(2)],
      ["30-Day Forecast (GHS)", (ins.salesForecast?.next30DaysRevenue ?? 0).toFixed(2)],
      ["Gross Margin %", `${(ins.profitabilityAnalysis?.overallGrossMarginPct ?? 0).toFixed(2)}%`],
      ["Fraud Risk Level", ins.fraudAlerts?.riskLevel ?? "—"],
    ],
  );

  const topProds = meta.topProductsByRevenue ?? ins.productRankings?.topByRevenue ?? [];
  if (topProds.length > 0) {
    addHeading("Top Products by Revenue");
    addTable(
      ["#", "Product", "Revenue (GHS)", "Units"],
      topProds
        .slice(0, 15)
        .map((p, i) => [String(i + 1), p.name, p.revenue.toFixed(2), String(p.units)]),
    );
  }

  if ((ins.profitabilityAnalysis?.byCategory ?? []).length > 0) {
    addHeading("Profitability by Category");
    addTable(
      ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
      ins.profitabilityAnalysis.byCategory.map((c) => [
        c.category,
        c.revenue.toFixed(2),
        c.estimatedProfit.toFixed(2),
        `${c.marginPct.toFixed(1)}%`,
      ]),
    );
  }

  if ((ins.inventoryPrediction?.reorderSuggestions ?? []).length > 0) {
    addHeading("Reorder Suggestions");
    addTable(
      ["Product", "Qty", "Est. Cost (GHS)", "Reason"],
      ins.inventoryPrediction.reorderSuggestions.map((r) => [
        r.name,
        String(r.suggestedQty),
        String(r.estimatedCost ?? 0),
        r.reason,
      ]),
    );
  }

  if ((ins.pricingRecommendations?.items ?? []).length > 0) {
    addHeading("Pricing Recommendations");
    addTable(
      ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
      ins.pricingRecommendations.items.map((i) => [
        i.name,
        String(i.currentPrice),
        String(i.suggestedPrice),
        i.rationale,
      ]),
    );
  }

  if ((ins.fraudAlerts?.flaggedTransactions ?? []).length > 0) {
    addHeading("Flagged Transactions");
    addTable(
      ["Tx #", "Amount (GHS)", "Reason", "Date"],
      ins.fraudAlerts.flaggedTransactions.map((t) => [
        String(t.id),
        t.amount.toFixed(2),
        t.reason,
        new Date(t.date).toLocaleDateString("en-GH"),
      ]),
      [180, 30, 30],
    );
  }

  doc.save(`infinity-bi-report-${new Date().toISOString().split("T")[0]}.pdf`);
}

async function generateSectionPDF(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 95);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Infinity Business Intelligence · ${new Date().toLocaleDateString("en-GH")}`, 14, 25);
  doc.setTextColor(0);
  autoTable(doc, {
    startY: 30,
    head: [headers],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });
  doc.save(filename);
}

async function generateSectionWord(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    WidthType,
    AlignmentType,
  } = await import("docx");
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })] }),
          ],
          shading: { fill: "1E3A5F" },
        }),
    ),
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: String(cell), size: 18 })] }),
              ],
            }),
        ),
      }),
  );
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Infinity Business Intelligence · ${new Date().toLocaleDateString("en-GH")}`,
                color: "666666",
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            rows: [headerRow, ...dataRows],
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          new Paragraph({ text: "", alignment: AlignmentType.LEFT }),
        ],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  downloadBlob(
    new Blob([new Uint8Array(buf as unknown as ArrayBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename,
  );
}

async function generateSectionExcel(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Infinity Business Intelligence";
  const ws = wb.addWorksheet(title.slice(0, 31));
  const hRow = ws.addRow(headers);
  hRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin" } };
  });
  rows.forEach((row) => ws.addRow(row));
  ws.columns.forEach((col) => {
    col.width = Math.max(16, ...(col.values ?? []).map((v) => String(v ?? "").length + 4));
  });
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

function exportToCSV(data: InsightsResponse) {
  const ins = data.insights;
  const meta = data.meta;
  const topProds = meta.topProductsByRevenue ?? ins.productRankings?.topByRevenue ?? [];
  const rows: string[][] = [
    [
      "=== INFINITY BI REPORT ===",
      `Generated: ${new Date(meta.generatedAt).toLocaleString("en-GH")}`,
    ],
    [],
    ["SUMMARY"],
    ["Metric", "Value"],
    ["Total Transactions", String(meta.transactionCount)],
    ["Current Revenue (GHS)", meta.currentRevenue.toFixed(2)],
    ["Revenue Growth %", meta.revenueGrowth.toFixed(2)],
    ["7-Day Forecast (GHS)", (ins.salesForecast?.next7DaysRevenue ?? 0).toFixed(2)],
    ["30-Day Forecast (GHS)", (ins.salesForecast?.next30DaysRevenue ?? 0).toFixed(2)],
    ["Gross Margin %", (ins.profitabilityAnalysis?.overallGrossMarginPct ?? 0).toFixed(2)],
    ["Fraud Risk", ins.fraudAlerts?.riskLevel ?? "unknown"],
    [],
    ["TOP PRODUCTS BY REVENUE"],
    ["Rank", "Product", "Revenue (GHS)", "Units"],
    ...topProds.map((p, i) => [String(i + 1), p.name, p.revenue.toFixed(2), String(p.units)]),
    [],
    ["REORDER SUGGESTIONS"],
    ["Product", "Qty", "Est. Cost (GHS)", "Reason"],
    ...(ins.inventoryPrediction?.reorderSuggestions ?? []).map((r) => [
      r.name,
      String(r.suggestedQty),
      String(r.estimatedCost ?? 0),
      r.reason,
    ]),
    [],
    ["PRICING RECOMMENDATIONS"],
    ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
    ...(ins.pricingRecommendations?.items ?? []).map((i) => [
      i.name,
      String(i.currentPrice),
      String(i.suggestedPrice),
      i.rationale,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    `infinity-bi-report-${new Date().toISOString().split("T")[0]}.csv`,
  );
}

async function exportToWord(data: InsightsResponse) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
  } = await import("docx");

  const ins = data.insights;
  const meta = data.meta;
  const borderNone = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone };

  const h1 = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 } });
  const h2 = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } });
  const body = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 60 } });
  const bullet = (text: string) =>
    new Paragraph({ text: `• ${text}`, indent: { left: 360 }, spacing: { after: 40 } });

  const tableRow = (cells: string[], bold = false) =>
    new TableRow({
      children: cells.map(
        (c) =>
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: c, bold, size: bold ? 22 : 20 })] }),
            ],
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
          }),
      ),
    });

  const makeTable = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [tableRow(headers, true), ...rows.map((r) => tableRow(r))],
    });

  const topProds = meta.topProductsByRevenue ?? ins.productRankings?.topByRevenue ?? [];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "Infinity Business Intelligence Report", bold: true, size: 36 }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated: ${new Date(meta.generatedAt).toLocaleString("en-GH")} | Data Window: ${meta.dataWindow}`,
                size: 20,
                color: "666666",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          h1("Executive Summary"),
          body(ins.executiveSummary ?? ""),

          h1("Key Metrics"),
          makeTable(
            ["Metric", "Value"],
            [
              ["Total Transactions", String(meta.transactionCount)],
              ["Current Revenue (GHS)", meta.currentRevenue.toFixed(2)],
              ["Revenue Growth %", `${meta.revenueGrowth.toFixed(2)}%`],
              ["7-Day Forecast (GHS)", (ins.salesForecast?.next7DaysRevenue ?? 0).toFixed(2)],
              ["30-Day Forecast (GHS)", (ins.salesForecast?.next30DaysRevenue ?? 0).toFixed(2)],
              [
                "Overall Gross Margin %",
                `${(ins.profitabilityAnalysis?.overallGrossMarginPct ?? 0).toFixed(2)}%`,
              ],
              ["Fraud Risk Level", ins.fraudAlerts?.riskLevel ?? "unknown"],
            ],
          ),

          ...(ins.salesForecast
            ? [
                h1("Sales Forecast"),
                body(
                  `Trend: ${ins.salesForecast.trend} (${ins.salesForecast.trendPercent > 0 ? "+" : ""}${ins.salesForecast.trendPercent.toFixed(1)}%) | Confidence: ${ins.salesForecast.confidence}`,
                ),
                h2("Key Drivers"),
                ...(ins.salesForecast.keyDrivers ?? []).map((d) => bullet(d)),
                h2("Recommendations"),
                ...(ins.salesForecast.recommendations ?? []).map((r) => bullet(r)),
              ]
            : []),

          ...(topProds.length > 0
            ? [
                h1("Top Products by Revenue"),
                makeTable(
                  ["Rank", "Product", "Revenue (GHS)", "Units"],
                  topProds
                    .slice(0, 15)
                    .map((p, i) => [String(i + 1), p.name, p.revenue.toFixed(2), String(p.units)]),
                ),
              ]
            : []),

          ...(ins.profitabilityAnalysis
            ? [
                h1("Profitability Analysis"),
                body(
                  `Overall Gross Margin: ${(ins.profitabilityAnalysis.overallGrossMarginPct ?? 0).toFixed(1)}% | Best category: ${ins.profitabilityAnalysis.highestMarginCategory ?? "—"} | Lowest: ${ins.profitabilityAnalysis.lowestMarginCategory ?? "—"}`,
                ),
                ...((ins.profitabilityAnalysis.byCategory ?? []).length > 0
                  ? [
                      makeTable(
                        ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
                        ins.profitabilityAnalysis.byCategory.map((c) => [
                          c.category,
                          c.revenue.toFixed(2),
                          c.estimatedProfit.toFixed(2),
                          `${c.marginPct.toFixed(1)}%`,
                        ]),
                      ),
                    ]
                  : []),
                h2("Recommendations"),
                ...(ins.profitabilityAnalysis.recommendations ?? []).map((r) => bullet(r)),
              ]
            : []),

          ...(ins.inventoryPrediction
            ? [
                h1("Inventory & Reorder"),
                ...((ins.inventoryPrediction.reorderSuggestions ?? []).length > 0
                  ? [
                      h2("Reorder Suggestions"),
                      makeTable(
                        ["Product", "Qty to Order", "Est. Cost (GHS)", "Reason"],
                        ins.inventoryPrediction.reorderSuggestions.map((r) => [
                          r.name,
                          String(r.suggestedQty),
                          String(r.estimatedCost ?? 0),
                          r.reason,
                        ]),
                      ),
                    ]
                  : []),
                h2("Recommendations"),
                ...(ins.inventoryPrediction.recommendations ?? []).map((r) => bullet(r)),
              ]
            : []),

          ...(ins.seasonalDemand
            ? [
                h1("Seasonal Demand"),
                body(`Current Season: ${ins.seasonalDemand.currentSeason ?? "—"}`),
                body(ins.seasonalDemand.demandForecast ?? ""),
                h2("Recommendations"),
                ...(ins.seasonalDemand.recommendations ?? []).map((r) => bullet(r)),
              ]
            : []),

          ...(ins.pricingRecommendations?.items?.length > 0
            ? [
                h1("Pricing Recommendations"),
                body(ins.pricingRecommendations.overallStrategy ?? ""),
                makeTable(
                  ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
                  ins.pricingRecommendations.items.map((i) => [
                    i.name,
                    String(i.currentPrice),
                    String(i.suggestedPrice),
                    i.rationale,
                  ]),
                ),
              ]
            : []),

          ...(ins.fraudAlerts
            ? [
                h1("Fraud & Security Alerts"),
                body(`Overall Risk Level: ${ins.fraudAlerts.riskLevel?.toUpperCase()}`),
                ...((ins.fraudAlerts.flaggedTransactions ?? []).length > 0
                  ? [
                      makeTable(
                        ["Tx #", "Amount (GHS)", "Reason", "Date"],
                        ins.fraudAlerts.flaggedTransactions.map((t) => [
                          String(t.id),
                          t.amount.toFixed(2),
                          t.reason,
                          new Date(t.date).toLocaleDateString("en-GH"),
                        ]),
                      ),
                    ]
                  : []),
                h2("Recommendations"),
                ...(ins.fraudAlerts.recommendations ?? []).map((r) => bullet(r)),
              ]
            : []),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  downloadBlob(
    new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    `infinity-bi-report-${new Date().toISOString().split("T")[0]}.docx`,
  );
}

function ExportPanel({ data }: { data: InsightsResponse }) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handle = useCallback(async (type: string, fn: () => Promise<void> | void) => {
    setExporting(type);
    try {
      await fn();
    } finally {
      setExporting(null);
    }
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      <span className="text-xs text-muted-foreground font-medium hidden sm:block">Export:</span>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => window.print()}
        disabled={!!exporting}
      >
        <Printer className="h-3.5 w-3.5" /> Print
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => handle("pdf", () => exportToPDF(data))}
        disabled={!!exporting}
      >
        {exporting === "pdf" ? (
          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-red-500" />
        )}{" "}
        PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => handle("word", () => exportToWord(data))}
        disabled={!!exporting}
      >
        {exporting === "word" ? (
          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-blue-500" />
        )}{" "}
        Word
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => handle("excel", () => exportToExcel(data))}
        disabled={!!exporting}
      >
        {exporting === "excel" ? (
          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
        )}{" "}
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => handle("csv", () => exportToCSV(data))}
        disabled={!!exporting}
      >
        {exporting === "csv" ? (
          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5 text-amber-500" />
        )}{" "}
        CSV
      </Button>
    </div>
  );
}

export default function AIInsights() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<InsightsResponse>({
    queryKey: ["ai-insights"],
    queryFn: () => customFetch<InsightsResponse>("/api/ai/insights"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const ins = data?.insights;
  const meta = data?.meta;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-root, .print-root * { visibility: visible; }
          .print-root { position: absolute; top: 0; left: 0; width: 100%; }
          .print-section { page-break-inside: avoid; }
          .print-content { display: block !important; }
          .print\\:hidden { display: none !important; }
          button { display: none !important; }
        }
      `}</style>

      <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto print-root">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Business Intelligence</h1>
              <p className="text-xs text-muted-foreground">
                OpenAI-powered · {meta?.dataWindow ?? "30-day"} analysis ·{" "}
                {meta?.generatedAt
                  ? new Date(meta.generatedAt).toLocaleTimeString("en-GH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Analyzing…" : "Refresh"}
            </Button>
            {data && <ExportPanel data={data} />}
          </div>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative">
                  <Brain className="h-12 w-12 text-primary/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                  </div>
                </div>
                <div>
                  <p className="font-semibold">AI is analyzing your business data…</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Scanning sales trends, inventory, customer patterns, and more. This may take
                    15–45 seconds.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {error && !isLoading && (
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <p className="font-medium text-red-400">Failed to generate insights</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Please try again. Make sure there is sales data available.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="ml-auto shrink-0"
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {data && ins && meta && !isLoading && (
          <>
            <KPIStrip meta={meta} />

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" /> Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {ins.executiveSummary}
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    {meta.transactionCount} transactions analyzed
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                    {meta.suspiciousTxCount} flagged for review
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {meta.revenueGrowth >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                    )}
                    {pct(meta.revenueGrowth)} revenue vs last period
                  </div>
                  {meta.totalProducts && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Package className="h-3.5 w-3.5 text-blue-400" />
                      {meta.totalProducts} products tracked
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {ins.salesForecast && (
                <CollapsibleSection
                  title="Sales Performance & Forecast"
                  icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                  defaultOpen={true}
                  badge={
                    <span
                      className={`text-xs font-semibold ${meta.revenueGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {pct(meta.revenueGrowth)}
                    </span>
                  }
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Week,Projected Revenue (GHS),Notes",
                                ...(ins.salesForecast.weeklyBreakdown ?? []).map(
                                  (w) => `${w.week},${w.projectedRevenue},${w.notes ?? ""}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "forecast.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Sales Forecast",
                          ["Week", "Projected Revenue (GHS)", "Notes"],
                          (ins.salesForecast.weeklyBreakdown ?? []).map((w) => [
                            w.week,
                            w.projectedRevenue.toFixed(2),
                            w.notes ?? "",
                          ]),
                          "sales-forecast.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Sales Forecast",
                          ["Week", "Projected Revenue (GHS)", "Notes"],
                          (ins.salesForecast.weeklyBreakdown ?? []).map((w) => [
                            w.week,
                            w.projectedRevenue.toFixed(2),
                            w.notes ?? "",
                          ]),
                          "sales-forecast.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Sales Forecast",
                          ["Week", "Projected Revenue (GHS)", "Notes"],
                          (ins.salesForecast.weeklyBreakdown ?? []).map((w) => [
                            w.week,
                            w.projectedRevenue.toFixed(2),
                            w.notes ?? "",
                          ]),
                          "sales-forecast.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <SalesForecastSection data={ins.salesForecast} meta={meta} />
                </CollapsibleSection>
              )}

              {ins.productRankings && (
                <CollapsibleSection
                  title="Product Rankings"
                  icon={<Trophy className="h-4 w-4 text-amber-400" />}
                  summary={
                    meta.topProductsByRevenue?.[0]
                      ? `Top: ${meta.topProductsByRevenue[0].name}`
                      : undefined
                  }
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "#,Product,Revenue (GHS),Units",
                                ...(
                                  meta.topProductsByRevenue ??
                                  ins.productRankings.topByRevenue ??
                                  []
                                ).map((p, i) => `${i + 1},${p.name},${p.revenue},${p.units}`),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "product-rankings.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Product Rankings",
                          ["#", "Product", "Revenue (GHS)", "Units"],
                          (meta.topProductsByRevenue ?? ins.productRankings.topByRevenue ?? [])
                            .slice(0, 30)
                            .map((p, i) => [
                              String(i + 1),
                              p.name,
                              p.revenue.toFixed(2),
                              String(p.units),
                            ]),
                          "product-rankings.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Product Rankings",
                          ["#", "Product", "Revenue (GHS)", "Units"],
                          (meta.topProductsByRevenue ?? ins.productRankings.topByRevenue ?? [])
                            .slice(0, 30)
                            .map((p, i) => [
                              String(i + 1),
                              p.name,
                              p.revenue.toFixed(2),
                              String(p.units),
                            ]),
                          "product-rankings.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Product Rankings",
                          ["#", "Product", "Revenue (GHS)", "Units"],
                          (meta.topProductsByRevenue ?? ins.productRankings.topByRevenue ?? [])
                            .slice(0, 30)
                            .map((p, i) => [
                              String(i + 1),
                              p.name,
                              p.revenue.toFixed(2),
                              String(p.units),
                            ]),
                          "product-rankings.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <ProductRankingsSection data={ins.productRankings} meta={meta} />
                </CollapsibleSection>
              )}

              {ins.inventoryPrediction && (
                <CollapsibleSection
                  title="Inventory Health & Reorder"
                  icon={<Package className="h-4 w-4 text-blue-400" />}
                  badge={
                    ins.inventoryPrediction.criticalItems?.length > 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium">
                        {ins.inventoryPrediction.criticalItems.length} critical
                      </span>
                    ) : undefined
                  }
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Product,Suggested Qty,Est. Cost (GHS),Reason",
                                ...(ins.inventoryPrediction.reorderSuggestions ?? []).map(
                                  (r) =>
                                    `${r.name},${r.suggestedQty},${r.estimatedCost ?? 0},${r.reason}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "reorder.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Reorder Suggestions",
                          ["Product", "Qty", "Est. Cost (GHS)", "Reason"],
                          (ins.inventoryPrediction.reorderSuggestions ?? []).map((r) => [
                            r.name,
                            String(r.suggestedQty),
                            String(r.estimatedCost ?? 0),
                            r.reason,
                          ]),
                          "reorder.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Reorder Suggestions",
                          ["Product", "Qty", "Est. Cost (GHS)", "Reason"],
                          (ins.inventoryPrediction.reorderSuggestions ?? []).map((r) => [
                            r.name,
                            String(r.suggestedQty),
                            String(r.estimatedCost ?? 0),
                            r.reason,
                          ]),
                          "reorder.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Reorder Suggestions",
                          ["Product", "Qty", "Est. Cost (GHS)", "Reason"],
                          (ins.inventoryPrediction.reorderSuggestions ?? []).map((r) => [
                            r.name,
                            String(r.suggestedQty),
                            String(r.estimatedCost ?? 0),
                            r.reason,
                          ]),
                          "reorder.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <InventoryHealthSection data={ins.inventoryPrediction} />
                </CollapsibleSection>
              )}

              {ins.inventoryTurnover && (
                <CollapsibleSection
                  title="Inventory Turnover"
                  icon={<RotateCcw className="h-4 w-4 text-violet-400" />}
                  summary={`${(ins.inventoryTurnover.overallTurnoverRate ?? 0).toFixed(2)}x overall`}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Category,Turnover Rate,Avg Days in Stock,Status",
                                ...(ins.inventoryTurnover.byCategory ?? []).map(
                                  (c) =>
                                    `${c.category},${(c.turnoverRate ?? 0).toFixed(2)},${c.avgDaysInStock ?? 0},${c.status}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "turnover.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Inventory Turnover",
                          ["Category", "Turnover Rate", "Avg Days in Stock", "Status"],
                          (ins.inventoryTurnover.byCategory ?? []).map((c) => [
                            c.category,
                            `${(c.turnoverRate ?? 0).toFixed(2)}x`,
                            `${c.avgDaysInStock ?? 0} days`,
                            c.status,
                          ]),
                          "turnover.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Inventory Turnover",
                          ["Category", "Turnover Rate", "Avg Days in Stock", "Status"],
                          (ins.inventoryTurnover.byCategory ?? []).map((c) => [
                            c.category,
                            `${(c.turnoverRate ?? 0).toFixed(2)}x`,
                            `${c.avgDaysInStock ?? 0} days`,
                            c.status,
                          ]),
                          "turnover.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Inventory Turnover",
                          ["Category", "Turnover Rate", "Avg Days in Stock", "Status"],
                          (ins.inventoryTurnover.byCategory ?? []).map((c) => [
                            c.category,
                            `${(c.turnoverRate ?? 0).toFixed(2)}x`,
                            `${c.avgDaysInStock ?? 0} days`,
                            c.status,
                          ]),
                          "turnover.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <TurnoverSection data={ins.inventoryTurnover} meta={meta} />
                </CollapsibleSection>
              )}

              {ins.stockAging && (
                <CollapsibleSection
                  title="Stock Aging"
                  icon={<Archive className="h-4 w-4 text-orange-400" />}
                  badge={
                    (ins.stockAging.agedItems ?? []).length > 0 ? (
                      <span className="text-xs text-orange-400">
                        {ins.stockAging.agedItems.length} aged items
                      </span>
                    ) : undefined
                  }
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Product,Est. Days in Stock,Stock,Recommended Action",
                                ...(ins.stockAging.agedItems ?? []).map(
                                  (i) =>
                                    `${i.name},${i.estimatedDaysInStock},${i.stock},${i.action}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "stock-aging.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Stock Aging",
                          ["Product", "Est. Days", "Stock", "Action"],
                          (ins.stockAging.agedItems ?? []).map((i) => [
                            i.name,
                            String(i.estimatedDaysInStock),
                            String(i.stock),
                            i.action,
                          ]),
                          "stock-aging.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Stock Aging",
                          ["Product", "Est. Days", "Stock", "Action"],
                          (ins.stockAging.agedItems ?? []).map((i) => [
                            i.name,
                            String(i.estimatedDaysInStock),
                            String(i.stock),
                            i.action,
                          ]),
                          "stock-aging.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Stock Aging",
                          ["Product", "Est. Days", "Stock", "Action"],
                          (ins.stockAging.agedItems ?? []).map((i) => [
                            i.name,
                            String(i.estimatedDaysInStock),
                            String(i.stock),
                            i.action,
                          ]),
                          "stock-aging.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <StockAgingSection data={ins.stockAging} />
                </CollapsibleSection>
              )}

              {ins.profitabilityAnalysis && (
                <CollapsibleSection
                  title="Profitability Analysis"
                  icon={<Banknote className="h-4 w-4 text-emerald-400" />}
                  summary={`${(ins.profitabilityAnalysis.overallGrossMarginPct ?? 0).toFixed(1)}% gross margin`}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Category,Revenue (GHS),Est. Profit (GHS),Margin %",
                                ...(ins.profitabilityAnalysis.byCategory ?? []).map(
                                  (c) =>
                                    `${c.category},${c.revenue.toFixed(2)},${c.estimatedProfit.toFixed(2)},${c.marginPct.toFixed(1)}%`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "profitability.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Profitability Analysis",
                          ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
                          (ins.profitabilityAnalysis.byCategory ?? []).map((c) => [
                            c.category,
                            c.revenue.toFixed(2),
                            c.estimatedProfit.toFixed(2),
                            `${c.marginPct.toFixed(1)}%`,
                          ]),
                          "profitability.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Profitability Analysis",
                          ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
                          (ins.profitabilityAnalysis.byCategory ?? []).map((c) => [
                            c.category,
                            c.revenue.toFixed(2),
                            c.estimatedProfit.toFixed(2),
                            `${c.marginPct.toFixed(1)}%`,
                          ]),
                          "profitability.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Profitability Analysis",
                          ["Category", "Revenue (GHS)", "Est. Profit (GHS)", "Margin %"],
                          (ins.profitabilityAnalysis.byCategory ?? []).map((c) => [
                            c.category,
                            c.revenue.toFixed(2),
                            c.estimatedProfit.toFixed(2),
                            `${c.marginPct.toFixed(1)}%`,
                          ]),
                          "profitability.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <ProfitabilitySection data={ins.profitabilityAnalysis} />
                </CollapsibleSection>
              )}

              {ins.seasonalDemand && (
                <CollapsibleSection
                  title="Seasonal Demand"
                  icon={<Leaf className="h-4 w-4 text-green-400" />}
                  summary={ins.seasonalDemand.currentSeason}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Event,Timing,Expected Impact,Products to Stock",
                                ...(ins.seasonalDemand.upcomingEvents ?? []).map(
                                  (e) =>
                                    `${e.event},${e.timing},${e.expectedImpact},"${(e.productsToStock ?? []).join("; ")}"`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "seasonal.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Seasonal Demand",
                          ["Event", "Timing", "Expected Impact", "Products to Stock"],
                          (ins.seasonalDemand.upcomingEvents ?? []).map((e) => [
                            e.event,
                            e.timing,
                            e.expectedImpact,
                            (e.productsToStock ?? []).join(", "),
                          ]),
                          "seasonal.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Seasonal Demand",
                          ["Event", "Timing", "Expected Impact", "Products to Stock"],
                          (ins.seasonalDemand.upcomingEvents ?? []).map((e) => [
                            e.event,
                            e.timing,
                            e.expectedImpact,
                            (e.productsToStock ?? []).join(", "),
                          ]),
                          "seasonal.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Seasonal Demand",
                          ["Event", "Timing", "Expected Impact", "Products to Stock"],
                          (ins.seasonalDemand.upcomingEvents ?? []).map((e) => [
                            e.event,
                            e.timing,
                            e.expectedImpact,
                            (e.productsToStock ?? []).join(", "),
                          ]),
                          "seasonal.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <SeasonalSection data={ins.seasonalDemand} />
                </CollapsibleSection>
              )}

              {ins.customerPatterns && (
                <CollapsibleSection
                  title="Customer Trends"
                  icon={<Users className="h-4 w-4 text-blue-400" />}
                  summary={ins.customerPatterns.topSegment}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Metric,Value",
                                `Top Segment,${ins.customerPatterns.topSegment ?? ""}`,
                                `Avg Order Value (GHS),${ins.customerPatterns.averageOrderValue ?? ""}`,
                                `Peak Shopping Hours,"${(ins.customerPatterns.peakShoppingHours ?? []).join("; ")}"`,
                                `Loyalty Insights,${ins.customerPatterns.loyaltyInsights ?? ""}`,
                                `Churn Risk,${ins.customerPatterns.churnRisk ?? ""}`,
                                `Payment Methods,${ins.customerPatterns.paymentMethodInsights ?? ""}`,
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "customer-trends.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Customer Trends",
                          ["Metric", "Value"],
                          [
                            ["Top Segment", ins.customerPatterns.topSegment ?? ""],
                            [
                              "Avg Order Value (GHS)",
                              String(ins.customerPatterns.averageOrderValue ?? ""),
                            ],
                            [
                              "Peak Hours",
                              (ins.customerPatterns.peakShoppingHours ?? []).join(", "),
                            ],
                            ["Loyalty Insights", ins.customerPatterns.loyaltyInsights ?? ""],
                            ["Churn Risk", ins.customerPatterns.churnRisk ?? ""],
                          ],
                          "customer-trends.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Customer Trends",
                          ["Metric", "Value"],
                          [
                            ["Top Segment", ins.customerPatterns.topSegment ?? ""],
                            [
                              "Avg Order Value (GHS)",
                              String(ins.customerPatterns.averageOrderValue ?? ""),
                            ],
                            [
                              "Peak Hours",
                              (ins.customerPatterns.peakShoppingHours ?? []).join(", "),
                            ],
                            ["Loyalty Insights", ins.customerPatterns.loyaltyInsights ?? ""],
                            ["Churn Risk", ins.customerPatterns.churnRisk ?? ""],
                          ],
                          "customer-trends.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Customer Trends",
                          ["Metric", "Value"],
                          [
                            ["Top Segment", ins.customerPatterns.topSegment ?? ""],
                            [
                              "Avg Order Value (GHS)",
                              String(ins.customerPatterns.averageOrderValue ?? ""),
                            ],
                            [
                              "Peak Hours",
                              (ins.customerPatterns.peakShoppingHours ?? []).join(", "),
                            ],
                            ["Loyalty Insights", ins.customerPatterns.loyaltyInsights ?? ""],
                            ["Churn Risk", ins.customerPatterns.churnRisk ?? ""],
                          ],
                          "customer-trends.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <CustomerSection data={ins.customerPatterns} />
                </CollapsibleSection>
              )}

              {ins.pricingRecommendations && (
                <CollapsibleSection
                  title="Pricing Recommendations"
                  icon={<Tag className="h-4 w-4 text-violet-400" />}
                  summary={`${ins.pricingRecommendations.items?.length ?? 0} adjustments suggested`}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Product,Current Price (GHS),Suggested Price (GHS),Rationale",
                                ...(ins.pricingRecommendations.items ?? []).map(
                                  (i) =>
                                    `${i.name},${i.currentPrice},${i.suggestedPrice},${i.rationale}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "pricing.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Pricing Recommendations",
                          ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
                          (ins.pricingRecommendations.items ?? []).map((i) => [
                            i.name,
                            String(i.currentPrice),
                            String(i.suggestedPrice),
                            i.rationale,
                          ]),
                          "pricing.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Pricing Recommendations",
                          ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
                          (ins.pricingRecommendations.items ?? []).map((i) => [
                            i.name,
                            String(i.currentPrice),
                            String(i.suggestedPrice),
                            i.rationale,
                          ]),
                          "pricing.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Pricing Recommendations",
                          ["Product", "Current (GHS)", "Suggested (GHS)", "Rationale"],
                          (ins.pricingRecommendations.items ?? []).map((i) => [
                            i.name,
                            String(i.currentPrice),
                            String(i.suggestedPrice),
                            i.rationale,
                          ]),
                          "pricing.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <PricingSection data={ins.pricingRecommendations} />
                </CollapsibleSection>
              )}

              {ins.cashFlow && (
                <CollapsibleSection
                  title="Cash Flow Analysis"
                  icon={<Banknote className="h-4 w-4 text-cyan-400" />}
                  badge={
                    <span
                      className={`text-xs font-medium ${ins.cashFlow.cashFlowTrend === "positive" ? "text-emerald-400" : ins.cashFlow.cashFlowTrend === "negative" ? "text-red-400" : "text-amber-400"}`}
                    >
                      {ins.cashFlow.cashFlowTrend}
                    </span>
                  }
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Metric,Value (GHS)",
                                `Est. Monthly Revenue,${ins.cashFlow.estimatedMonthlyRevenue ?? ""}`,
                                `Est. Monthly COGS,${ins.cashFlow.estimatedMonthlyCOGS ?? ""}`,
                                `Est. Gross Profit,${ins.cashFlow.estimatedGrossProfit ?? ""}`,
                                `Projected Next Month,${ins.cashFlow.projectedNextMonth ?? ""}`,
                                `Cash Flow Trend,${ins.cashFlow.cashFlowTrend ?? ""}`,
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "cashflow.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Cash Flow Analysis",
                          ["Metric", "Value (GHS)"],
                          [
                            [
                              "Est. Monthly Revenue",
                              String(ins.cashFlow.estimatedMonthlyRevenue ?? ""),
                            ],
                            ["Est. Monthly COGS", String(ins.cashFlow.estimatedMonthlyCOGS ?? "")],
                            ["Est. Gross Profit", String(ins.cashFlow.estimatedGrossProfit ?? "")],
                            ["Projected Next Month", String(ins.cashFlow.projectedNextMonth ?? "")],
                            ["Cash Flow Trend", ins.cashFlow.cashFlowTrend ?? ""],
                          ],
                          "cashflow.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Cash Flow Analysis",
                          ["Metric", "Value (GHS)"],
                          [
                            [
                              "Est. Monthly Revenue",
                              String(ins.cashFlow.estimatedMonthlyRevenue ?? ""),
                            ],
                            ["Est. Monthly COGS", String(ins.cashFlow.estimatedMonthlyCOGS ?? "")],
                            ["Est. Gross Profit", String(ins.cashFlow.estimatedGrossProfit ?? "")],
                            ["Projected Next Month", String(ins.cashFlow.projectedNextMonth ?? "")],
                            ["Cash Flow Trend", ins.cashFlow.cashFlowTrend ?? ""],
                          ],
                          "cashflow.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Cash Flow Analysis",
                          ["Metric", "Value (GHS)"],
                          [
                            [
                              "Est. Monthly Revenue",
                              String(ins.cashFlow.estimatedMonthlyRevenue ?? ""),
                            ],
                            ["Est. Monthly COGS", String(ins.cashFlow.estimatedMonthlyCOGS ?? "")],
                            ["Est. Gross Profit", String(ins.cashFlow.estimatedGrossProfit ?? "")],
                            ["Projected Next Month", String(ins.cashFlow.projectedNextMonth ?? "")],
                            ["Cash Flow Trend", ins.cashFlow.cashFlowTrend ?? ""],
                          ],
                          "cashflow.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <CashFlowSection data={ins.cashFlow} />
                </CollapsibleSection>
              )}

              {ins.supplierPerformance && (
                <CollapsibleSection
                  title="Supplier Performance"
                  icon={<Truck className="h-4 w-4 text-indigo-400" />}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Supplier,Insight,Action",
                                ...(ins.supplierPerformance.supplierRecommendations ?? []).map(
                                  (s) => `${s.supplier},${s.insight},${s.action}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "suppliers.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Supplier Performance",
                          ["Supplier", "Insight", "Action"],
                          (ins.supplierPerformance.supplierRecommendations ?? []).map((s) => [
                            s.supplier,
                            s.insight,
                            s.action,
                          ]),
                          "suppliers.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Supplier Performance",
                          ["Supplier", "Insight", "Action"],
                          (ins.supplierPerformance.supplierRecommendations ?? []).map((s) => [
                            s.supplier,
                            s.insight,
                            s.action,
                          ]),
                          "suppliers.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Supplier Performance",
                          ["Supplier", "Insight", "Action"],
                          (ins.supplierPerformance.supplierRecommendations ?? []).map((s) => [
                            s.supplier,
                            s.insight,
                            s.action,
                          ]),
                          "suppliers.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <SupplierSection data={ins.supplierPerformance} />
                </CollapsibleSection>
              )}

              {ins.fraudAlerts && (
                <CollapsibleSection
                  title="Fraud & Security"
                  icon={<ShieldAlert className="h-4 w-4 text-red-400" />}
                  badge={<RiskBadge level={ins.fraudAlerts.riskLevel} />}
                  sectionExports={[
                    {
                      label: "📄 Download CSV",
                      handler: () =>
                        downloadBlob(
                          new Blob(
                            [
                              [
                                "Tx #,Amount (GHS),Reason,Date",
                                ...(ins.fraudAlerts.flaggedTransactions ?? []).map(
                                  (t) =>
                                    `${t.id},${t.amount},${t.reason},${new Date(t.date).toLocaleDateString("en-GH")}`,
                                ),
                              ].join("\n"),
                            ],
                            { type: "text/csv" },
                          ),
                          "fraud-flags.csv",
                        ),
                    },
                    {
                      label: "📑 Download PDF",
                      handler: () =>
                        generateSectionPDF(
                          "Fraud & Security Flags",
                          ["Tx #", "Amount (GHS)", "Reason", "Date"],
                          (ins.fraudAlerts.flaggedTransactions ?? []).map((t) => [
                            String(t.id),
                            t.amount.toFixed(2),
                            t.reason,
                            new Date(t.date).toLocaleDateString("en-GH"),
                          ]),
                          "fraud-flags.pdf",
                        ),
                    },
                    {
                      label: "📝 Download Word (.docx)",
                      handler: () =>
                        generateSectionWord(
                          "Fraud & Security Flags",
                          ["Tx #", "Amount (GHS)", "Reason", "Date"],
                          (ins.fraudAlerts.flaggedTransactions ?? []).map((t) => [
                            String(t.id),
                            t.amount.toFixed(2),
                            t.reason,
                            new Date(t.date).toLocaleDateString("en-GH"),
                          ]),
                          "fraud-flags.docx",
                        ),
                    },
                    {
                      label: "📊 Download Excel (.xlsx)",
                      handler: () =>
                        generateSectionExcel(
                          "Fraud & Security Flags",
                          ["Tx #", "Amount (GHS)", "Reason", "Date"],
                          (ins.fraudAlerts.flaggedTransactions ?? []).map((t) => [
                            String(t.id),
                            t.amount.toFixed(2),
                            t.reason,
                            new Date(t.date).toLocaleDateString("en-GH"),
                          ]),
                          "fraud-flags.xlsx",
                        ),
                    },
                    { label: "🖨 Print Report", handler: () => window.print() },
                  ]}
                >
                  <FraudSection data={ins.fraudAlerts} />
                </CollapsibleSection>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
