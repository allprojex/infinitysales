import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  RefreshCw,
  Printer,
  Pencil,
  Trash2,
  Zap,
  ShoppingCart,
  ShoppingBag,
  Banknote,
  Calendar,
  TrendingUp,
  Package,
} from "lucide-react";

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(v);

type ReportType = "sales" | "purchase" | "expense";
type ReportPeriod = "weekly" | "bimonthly" | "monthly";

interface GeneratedReport {
  id: number;
  reportType: ReportType;
  period: ReportPeriod;
  title: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  data: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<
  ReportType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  sales: {
    label: "Sales",
    icon: ShoppingCart,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  purchase: {
    label: "Purchase",
    icon: ShoppingBag,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  expense: {
    label: "Expense",
    icon: Banknote,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
};

const PERIOD_META: Record<ReportPeriod, { label: string; color: string }> = {
  weekly: { label: "Weekly", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  bimonthly: { label: "Bi-Monthly", color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  monthly: { label: "Monthly", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
};

function SalesDataView({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    totalRevenue?: number;
    totalSales?: number;
    avgTransactionValue?: number;
    byChannel?: Array<{ channel: string; revenue: string; count: number }>;
    topProducts?: Array<{ name: string; unitsSold: number; revenue: string }>;
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-lg font-bold text-emerald-400">{GHS(d.totalRevenue ?? 0)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Transactions</p>
          <p className="text-lg font-bold">{(d.totalSales ?? 0).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Avg Value</p>
          <p className="text-lg font-bold">{GHS(d.avgTransactionValue ?? 0)}</p>
        </div>
      </div>
      {d.byChannel && d.byChannel.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            By Channel
          </p>
          <div className="space-y-1">
            {d.byChannel.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1 border-b border-muted/30 last:border-0"
              >
                <span className="capitalize">{c.channel}</span>
                <span className="font-medium">
                  {GHS(parseFloat(c.revenue))}{" "}
                  <span className="text-muted-foreground">({c.count} sales)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.topProducts && d.topProducts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top Products
          </p>
          <div className="space-y-1">
            {d.topProducts.slice(0, 5).map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1 border-b border-muted/30 last:border-0"
              >
                <span className="truncate flex-1 mr-4">{p.name}</span>
                <span className="text-muted-foreground text-xs">
                  {p.unitsSold} units · {GHS(parseFloat(p.revenue))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseDataView({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    totalValue?: number;
    totalOrders?: number;
    byStatus?: Array<{ status: string; count: number; value: string }>;
    bySupplier?: Array<{ supplierName: string; totalValue: string; orderCount: number }>;
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Total PO Value</p>
          <p className="text-lg font-bold text-blue-400">{GHS(d.totalValue ?? 0)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Purchase Orders</p>
          <p className="text-lg font-bold">{(d.totalOrders ?? 0).toLocaleString()}</p>
        </div>
      </div>
      {d.byStatus && d.byStatus.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            By Status
          </p>
          <div className="space-y-1">
            {d.byStatus.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1 border-b border-muted/30 last:border-0"
              >
                <span className="capitalize">{s.status}</span>
                <span className="font-medium">
                  {s.count} orders · {GHS(parseFloat(s.value))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.bySupplier && d.bySupplier.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top Suppliers
          </p>
          <div className="space-y-1">
            {d.bySupplier.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1 border-b border-muted/30 last:border-0"
              >
                <span className="truncate flex-1 mr-4">{s.supplierName}</span>
                <span className="text-muted-foreground text-xs">
                  {s.orderCount} orders · {GHS(parseFloat(s.totalValue))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseDataView({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    totalExpenses?: number;
    totalPurchaseOrders?: number;
    lowStockAlerts?: number;
    expiringItems?: number;
    byStatus?: Array<{ status: string; count: number; value: string }>;
    bySupplier?: Array<{ supplierName: string; totalValue: string; orderCount: number }>;
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Total Expenses</p>
          <p className="text-lg font-bold text-amber-400">{GHS(d.totalExpenses ?? 0)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Purchase Orders</p>
          <p className="text-lg font-bold">{(d.totalPurchaseOrders ?? 0).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
          <p className="text-lg font-bold text-red-400">{d.lowStockAlerts ?? 0}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">Expiring Items</p>
          <p className="text-lg font-bold text-orange-400">{d.expiringItems ?? 0}</p>
        </div>
      </div>
      {d.bySupplier && d.bySupplier.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top Expense Sources
          </p>
          <div className="space-y-1">
            {d.bySupplier.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1 border-b border-muted/30 last:border-0"
              >
                <span className="truncate flex-1 mr-4">{s.supplierName}</span>
                <span className="text-muted-foreground text-xs">
                  {GHS(parseFloat(s.totalValue))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDataView({ report }: { report: GeneratedReport }) {
  if (report.reportType === "sales") return <SalesDataView data={report.data} />;
  if (report.reportType === "purchase") return <PurchaseDataView data={report.data} />;
  return <ExpenseDataView data={report.data} />;
}

function PrintableReport({ report }: { report: GeneratedReport }) {
  const meta = TYPE_META[report.reportType];
  return (
    <div className="p-8 max-w-3xl mx-auto font-sans text-black bg-white print:block">
      <div className="border-b-2 border-gray-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold">Infinity Sales &amp; Inventory Management</h1>
        <h2 className="text-lg font-semibold mt-1">{report.title}</h2>
        <p className="text-sm text-gray-600 mt-1">
          Period: {report.periodLabel} &nbsp;|&nbsp; {report.startDate} to {report.endDate}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Generated: {new Date(report.createdAt).toLocaleString("en-GH")}
        </p>
      </div>
      {report.notes && (
        <div className="mb-4 p-3 bg-gray-50 border rounded text-sm">
          <strong>Notes:</strong> {report.notes}
        </div>
      )}
      <div className="text-sm">
        {report.reportType === "sales" && <SalesDataView data={report.data} />}
        {report.reportType === "purchase" && <PurchaseDataView data={report.data} />}
        {report.reportType === "expense" && <ExpenseDataView data={report.data} />}
      </div>
      <div className="mt-8 border-t pt-3 text-xs text-gray-400">
        Infinity Techub Intelligence · {new Date().getFullYear()}
      </div>
    </div>
  );
}

export default function GeneratedReports() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [viewReport, setViewReport] = useState<GeneratedReport | null>(null);
  const [editReport, setEditReport] = useState<GeneratedReport | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const params = new URLSearchParams();
  if (filterType !== "all") params.set("type", filterType);
  if (filterPeriod !== "all") params.set("period", filterPeriod);

  const { data, isLoading, refetch } = useQuery<{ data: GeneratedReport[]; total: number }>({
    queryKey: ["generated-reports", filterType, filterPeriod],
    queryFn: () => customFetch(`/api/admin/generated-reports?${params.toString()}`),
  });

  const autoGenerate = useMutation({
    mutationFn: () => customFetch("/api/admin/generated-reports/auto-generate", { method: "POST" }),
    onSuccess: (res: unknown) => {
      const r = res as { generated: number; skipped: number };
      toast({
        title: "Reports generated",
        description: `${r.generated} new, ${r.skipped} already exist`,
      });
      qc.invalidateQueries({ queryKey: ["generated-reports"] });
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const patchReport = useMutation({
    mutationFn: ({ id, title, notes }: { id: number; title: string; notes: string }) =>
      customFetch(`/api/admin/generated-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, notes }),
      }),
    onSuccess: () => {
      toast({ title: "Report updated" });
      qc.invalidateQueries({ queryKey: ["generated-reports"] });
      setEditReport(null);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteReport = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/generated-reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Report deleted" });
      qc.invalidateQueries({ queryKey: ["generated-reports"] });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handlePrint = (report: GeneratedReport) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const style = `
      body { font-family: system-ui, sans-serif; margin: 0; padding: 0; }
      .grid { display: grid; gap: 12px; }
      .grid-cols-2 { grid-template-columns: 1fr 1fr; }
      .grid-cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    `;
    const content = printRef.current?.innerHTML ?? "";
    win.document.write(
      `<html><head><title>${report.title}</title><style>${style}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const openEdit = (r: GeneratedReport) => {
    setEditReport(r);
    setEditTitle(r.title);
    setEditNotes(r.notes ?? "");
  };

  const reports = data?.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Hidden print container */}
      <div ref={printRef} style={{ display: "none" }}>
        {viewReport && <PrintableReport report={viewReport} />}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Auto-Generated Reports</h1>
            <p className="text-xs text-muted-foreground">
              Weekly · Bi-Monthly · Monthly — Sales, Purchases, Expenses
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => autoGenerate.mutate()}
            disabled={autoGenerate.isPending}
            className="gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            {autoGenerate.isPending ? "Generating…" : "Generate Current Periods"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Report Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="bimonthly">Bi-Monthly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <span className="text-xs text-muted-foreground flex items-center ml-1">
            {data.total} reports
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading reports…
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium">No reports generated yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Generate Current Periods" to auto-create all reports for this week, bi-month,
              and month.
            </p>
            <Button
              className="mt-4 gap-1.5"
              size="sm"
              onClick={() => autoGenerate.mutate()}
              disabled={autoGenerate.isPending}
            >
              <Zap className="h-3.5 w-3.5" />
              Generate Now
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && reports.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((r) => {
            const meta = TYPE_META[r.reportType];
            const period = PERIOD_META[r.period];
            const Icon = meta.icon;
            return (
              <Card
                key={r.id}
                className={`border ${meta.bg} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => setViewReport(r)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${period.color}`}
                    >
                      {period.label}
                    </span>
                  </div>
                  <CardTitle className="text-sm leading-tight mt-1">{r.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Calendar className="h-3 w-3" />
                    {r.periodLabel}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-muted-foreground italic truncate mb-2">{r.notes}</p>
                  )}
                  <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        setViewReport(r);
                        setTimeout(() => handlePrint(r), 100);
                      }}
                    >
                      <Printer className="h-3 w-3" />
                      Print
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewReport} onOpenChange={(open) => !open && setViewReport(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {viewReport && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-semibold ${TYPE_META[viewReport.reportType].color}`}
                  >
                    {TYPE_META[viewReport.reportType].label}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${PERIOD_META[viewReport.period].color}`}
                  >
                    {PERIOD_META[viewReport.period].label}
                  </span>
                </div>
                <DialogTitle className="text-base leading-tight">{viewReport.title}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {viewReport.periodLabel} · {viewReport.startDate} to {viewReport.endDate}
                </p>
              </DialogHeader>
              {viewReport.notes && (
                <div className="p-2.5 rounded-lg bg-muted/40 text-sm text-muted-foreground">
                  <span className="font-medium">Notes:</span> {viewReport.notes}
                </div>
              )}
              <ReportDataView report={viewReport} />
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handlePrint(viewReport)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    openEdit(viewReport);
                    setViewReport(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editReport} onOpenChange={(open) => !open && setEditReport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Add notes or comments…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReport(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editReport &&
                patchReport.mutate({ id: editReport.id, title: editTitle, notes: editNotes })
              }
              disabled={patchReport.isPending || !editTitle.trim()}
            >
              {patchReport.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteReport.mutate(deleteId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
