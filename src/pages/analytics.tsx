// @ts-nocheck
import { useState } from "react";
import {
  useGetReportSummary, useGetRevenueOverTime, useGetTopProducts,
  useGetTopCustomers, useListProducts, getListProductsQueryKey, customFetch,
} from "@/workspace/api-client-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, Banknote, Users, ShoppingCart, Package,
  ArrowUpRight, ArrowDownRight, BarChart2, AlertTriangle, Award,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const GHS = (v: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(v);
const COLORS = ["hsl(220 80% 55%)", "hsl(142 71% 45%)", "hsl(30 90% 55%)", "hsl(265 80% 60%)", "hsl(0 75% 55%)", "hsl(180 60% 45%)"];

function StatCard({ label, value, sub, icon: Icon, trend, trendLabel, color = "primary" }: {
  label: string; value: string; sub?: string; icon: React.ComponentType<{className?: string}>;
  trend?: "up" | "down" | "neutral"; trendLabel?: string; color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {trendLabel && trend !== "neutral" && (
              <div className={`flex items-center gap-1 text-xs font-medium ${trend === "up" ? "text-green-600" : "text-red-500"}`}>
                {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trendLabel}
              </div>
            )}
          </div>
          <div className={`h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{value: number; name: string; color: string}>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-xl shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-xs">{p.name}: <span className="font-semibold">{typeof p.value === "number" ? (p.name.toLowerCase().includes("revenue") || p.name.toLowerCase().includes("sales") ? GHS(p.value) : p.value.toLocaleString()) : p.value}</span></p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [revMonths, setRevMonths] = useState("6");

  const { data: summary } = useGetReportSummary();
  const { data: revenue } = useGetRevenueOverTime({ months: Number(revMonths) });
  const { data: topProducts } = useGetTopProducts({ limit: 10 });
  const { data: topCustomers } = useGetTopCustomers({ limit: 8 });
  const { data: stockData } = useListProducts({ limit: 100 }, {
    query: { queryKey: getListProductsQueryKey({ limit: 100 }) }
  });

  const { data: categoryData } = useQuery({
    queryKey: ["analytics-categories"],
    queryFn: async () => {
      const d = await customFetch<{ data: Array<{ category: string | null; totalRevenue: number; totalUnits: number }> }>("/api/reports/top-products?limit=100");
      const cats: Record<string, number> = {};
      d?.data?.forEach(p => { const c = p.category || "Uncategorised"; cats[c] = (cats[c] || 0) + (p.totalRevenue || 0); });
      return Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
    },
  });

  const revenueChartData = revenue?.map((d: { month: string; revenue: number; sales: number }) => ({
    month: d.month, revenue: Number(d.revenue), orders: d.sales,
  })) ?? [];

  const topProductsData = topProducts?.slice(0, 8).map((p: { name: string; revenue: number; unitsSold: number }) => ({
    name: p.name.length > 16 ? p.name.slice(0, 14) + "…" : p.name,
    revenue: Number(p.revenue), units: p.unitsSold,
  })) ?? [];

  const topCustomersData = topCustomers?.map((c: { name: string; totalSpend: number; totalOrders: number }) => ({
    name: c.name.split(" ")[0], spend: Number(c.totalSpend), orders: c.totalOrders,
  })) ?? [];

  const allStock = stockData?.data ?? [];
  const outOfStock = allStock.filter(p => p.stock === 0).length;
  const lowStock = allStock.filter(p => p.stock > 0 && p.stock <= p.reorderPoint).length;
  const healthyStock = allStock.filter(p => p.stock > p.reorderPoint).length;
  const stockHealth = [
    { name: "Healthy", value: healthyStock, color: "hsl(142 71% 45%)" },
    { name: "Low Stock", value: lowStock, color: "hsl(38 92% 50%)" },
    { name: "Out of Stock", value: outOfStock, color: "hsl(0 72% 51%)" },
  ].filter(d => d.value > 0);

  const totalRevenue = Number(summary?.totalRevenue ?? 0);
  const totalOrders = summary?.totalSales ?? 0;
  const totalCustomers = summary?.totalCustomers ?? 0;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Full business intelligence — revenue, inventory, customers, and more.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={GHS(totalRevenue)} icon={Banknote} trend="up" trendLabel="All time" />
        <StatCard label="Total Orders" value={totalOrders.toLocaleString()} icon={ShoppingCart} trend="up" trendLabel="All time" />
        <StatCard label="Total Customers" value={totalCustomers.toLocaleString()} icon={Users} trend="up" trendLabel="Registered" />
        <StatCard label="Avg Order Value" value={GHS(avgOrder)} icon={TrendingUp} sub="Per transaction" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1 rounded-xl mb-2">
          <TabsTrigger value="overview" className="rounded-lg gap-1.5 text-xs"><BarChart2 className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="sales" className="rounded-lg gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" />Sales</TabsTrigger>
          <TabsTrigger value="products" className="rounded-lg gap-1.5 text-xs"><Package className="h-3.5 w-3.5" />Products</TabsTrigger>
          <TabsTrigger value="customers" className="rounded-lg gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Customers</TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg gap-1.5 text-xs"><Award className="h-3.5 w-3.5" />Inventory</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Revenue chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div><CardTitle className="text-sm font-medium">Revenue Trend</CardTitle><CardDescription className="text-xs">Monthly revenue over time</CardDescription></div>
                <Select value={revMonths} onValueChange={setRevMonths}>
                  <SelectTrigger className="w-24 h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="3">3 months</SelectItem><SelectItem value="6">6 months</SelectItem><SelectItem value="12">12 months</SelectItem></SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={revenueChartData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(220 80% 55%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(220 80% 55%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(220 80% 55%)" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category breakdown */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Revenue by Category</CardTitle><CardDescription className="text-xs">Top categories by revenue</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categoryData ?? []} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {(categoryData ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => GHS(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {(categoryData ?? []).slice(0, 4).map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                      <span className="font-medium">{GHS(c.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top products + Inventory health */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top 8 Products by Revenue</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topProductsData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(220 80% 55%)" radius={[0, 4, 4, 0]}>
                      {topProductsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Stock Health</CardTitle><CardDescription className="text-xs">Current inventory status distribution</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={stockHealth} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {stockHealth.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {stockHealth.map(s => (
                    <div key={s.name} className="text-center">
                      <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.name}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Monthly Revenue" value={GHS(revenueChartData.at(-1)?.revenue ?? 0)} icon={Banknote} sub="This month" />
            <StatCard label="Monthly Orders" value={String(revenueChartData.at(-1)?.orders ?? 0)} icon={ShoppingCart} sub="This month" />
            <StatCard label="Avg Monthly Revenue" value={GHS(revenueChartData.length > 0 ? revenueChartData.reduce((s, d) => s + d.revenue, 0) / revenueChartData.length : 0)} icon={TrendingUp} />
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div><CardTitle className="text-sm font-medium">Revenue & Orders Over Time</CardTitle></div>
              <Select value={revMonths} onValueChange={setRevMonths}>
                <SelectTrigger className="w-24 h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="3">3 months</SelectItem><SelectItem value="6">6 months</SelectItem><SelectItem value="12">12 months</SelectItem></SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 11 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="hsl(220 80% 55%)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="ord" dataKey="orders" name="Orders" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Products by Revenue</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topProducts?.slice(0, 8).map((p: { name: string; revenue: number; unitsSold: number; category?: string | null }, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.unitsSold} units sold</p>
                      </div>
                      <p className="text-sm font-semibold text-primary">{GHS(Number(p.revenue))}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Revenue by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => GHS(v)} />
                    <Bar dataKey="value" name="Revenue" radius={[0, 4, 4, 0]}>
                      {(categoryData ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Units Sold — Top 10 Products</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topProductsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="units" name="Units Sold" radius={[4, 4, 0, 0]}>
                    {topProductsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CUSTOMERS TAB */}
        <TabsContent value="customers" className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard label="Total Customers" value={totalCustomers.toLocaleString()} icon={Users} />
            <StatCard label="Top Customer Spend" value={GHS(Number(topCustomers?.[0]?.totalSpend ?? 0))} icon={Award} sub={topCustomers?.[0]?.name ?? "-"} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Customers by Spend</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topCustomers?.map((c: { name: string; totalSpend: number; totalOrders: number }, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">{c.name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.totalOrders} orders</p>
                      </div>
                      <p className="text-sm font-semibold">{GHS(Number(c.totalSpend))}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Customer Spend Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topCustomersData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="spend" name="Total Spend" radius={[4, 4, 0, 0]}>
                      {topCustomersData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INVENTORY TAB */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Total Products" value={String(allStock.length)} icon={Package} />
            <StatCard label="Low Stock Items" value={String(lowStock)} icon={AlertTriangle} sub="Below reorder point" trend={lowStock > 0 ? "down" : "neutral"} trendLabel={lowStock > 0 ? "Needs attention" : undefined} />
            <StatCard label="Out of Stock" value={String(outOfStock)} icon={AlertTriangle} trend={outOfStock > 0 ? "down" : "neutral"} trendLabel={outOfStock > 0 ? "Urgent" : undefined} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Stock Health Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stockHealth} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={4} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {stockHealth.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Low Stock Alert</CardTitle><p className="text-xs text-muted-foreground">Products at or below reorder point</p></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {allStock.filter(p => p.stock <= p.reorderPoint).slice(0, 10).map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${p.stock === 0 ? "bg-red-500" : "bg-amber-500"}`} />
                      <p className="flex-1 text-sm truncate">{p.name}</p>
                      <Badge variant="outline" className={`text-[10px] ${p.stock === 0 ? "border-red-300 text-red-600" : "border-amber-300 text-amber-600"}`}>
                        {p.stock === 0 ? "Out" : `${p.stock} left`}
                      </Badge>
                    </div>
                  ))}
                  {allStock.filter(p => p.stock <= p.reorderPoint).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">All products are adequately stocked</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top 10 Products by Stock Value</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {allStock.sort((a, b) => Number(b.price) * b.stock - Number(a.price) * a.stock).slice(0, 10).map((p, i) => {
                  const value = Number(p.price) * p.stock;
                  const maxValue = Number(allStock[0]?.price ?? 1) * (allStock[0]?.stock ?? 1);
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1"><span className="font-medium truncate">{p.name}</span><span className="text-muted-foreground">{GHS(value)}</span></div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((value / maxValue) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}