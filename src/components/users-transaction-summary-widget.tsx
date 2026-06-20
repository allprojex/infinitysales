import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";

type Row = {
  userId: string;
  soldBy: string;
  warehouseId: string | null;
  warehouseName: string;
  category: string;
  itemsSold: number;
  totalAmount: number;
  salesCount: number;
};

type Resp = {
  rows: Row[];
  period: { startDate: string | null; endDate: string | null };
  options: {
    warehouses: { id: string; name: string }[];
    categories: string[];
    users: { id: string; name: string }[];
  };
  isPrivileged: boolean;
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

function defaultRange() {
  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const end = today.toISOString().split("T")[0];
  return { start, end };
}

export function UsersTransactionSummaryWidget() {
  const [{ start, end }, setRange] = useState(defaultRange);
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (start) p.set("startDate", start);
    if (end) p.set("endDate", end);
    if (warehouseId !== "all") p.set("warehouseId", warehouseId);
    if (category !== "all") p.set("category", category);
    if (userId !== "all") p.set("userId", userId);
    return p.toString();
  }, [start, end, warehouseId, category, userId]);

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["/api/reports/users-transaction-summary", start, end, warehouseId, category, userId],
    queryFn: () => customFetch<Resp>(`/api/reports/users-transaction-summary?${qs}`),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const isPrivileged = !!data?.isPrivileged;

  const totals = useMemo(() => {
    const items = rows.reduce((s, r) => s + r.itemsSold, 0);
    const amount = rows.reduce((s, r) => s + r.totalAmount, 0);
    const sales = rows.reduce((s, r) => s + r.salesCount, 0);
    return { items, amount, sales };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-base">Users Transaction Summary</CardTitle>
              <CardDescription className="text-xs">
                {isPrivileged ? "All users' sales" : "Your sales"} · {start} → {end}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2 items-center text-xs">
            <Badge variant="secondary">{rows.length} groups</Badge>
            <Badge variant="outline">{totals.items} items</Badge>
            <Badge>{GHS(totals.amount)}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-3">
          <Input
            type="date"
            value={start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className="h-9 text-xs"
            aria-label="Start date"
          />
          <Input
            type="date"
            value={end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className="h-9 text-xs"
            aria-label="End date"
          />
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Warehouse" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {(data?.options.warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(data?.options.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPrivileged ? (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {(data?.options.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-medium py-2 px-2">Sold By</th>
                <th className="text-left font-medium py-2 px-2">Warehouse</th>
                <th className="text-left font-medium py-2 px-2">Category</th>
                <th className="text-right font-medium py-2 px-2">Sales</th>
                <th className="text-right font-medium py-2 px-2">Items</th>
                <th className="text-right font-medium py-2 px-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No sales for the selected filters</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.userId}-${r.warehouseId ?? "n"}-${r.category}-${i}`} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium truncate max-w-[140px]">{r.soldBy}</td>
                    <td className="py-2 px-2 truncate max-w-[140px]">{r.warehouseName}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.salesCount}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.itemsSold}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{GHS(r.totalAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={3} className="py-2 px-2 text-right">Totals</td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.sales}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.items}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{GHS(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
