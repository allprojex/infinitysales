// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { customFetch } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  Banknote,
  AlertTriangle,
  Warehouse,
  ShoppingBag,
  CalendarCheck,
  RefreshCw,
  Loader2,
  BarChart2,
  UserCheck,
  CreditCard,
  Truck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(v);

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/* ── Export utilities ─────────────────────────────────── */

/** Sanitize and RFC 4180-escape a CSV cell value.
 *  1. Convert to string.
 *  2. Neutralize formula injection by prefixing with a single quote if the
 *     value starts with a spreadsheet formula character (=, +, -, @, tab, CR).
 *  3. Escape embedded double quotes by doubling them (RFC 4180), then wrap
 *     the whole field in double quotes.
 */
function sanitizeCsvCell(value: unknown): string {
  let str = String(value ?? "");
  const formulaPrefixes = ["=", "+", "-", "@", "\t", "\r"];
  if (formulaPrefixes.some((p) => str.startsWith(p))) {
    str = "'" + str;
  }
  return '"' + str.replace(/"/g, '""') + '"';
}

/** Escape HTML special characters to prevent XSS when injecting into documents. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => sanitizeCsvCell(r[k])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportExcel(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.substring(0, 31));
  if (rows.length > 0) {
    ws.addRow(Object.keys(rows[0]));
    rows.forEach((r) => ws.addRow(Object.values(r).map((v) => v ?? "")));
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(filename: string, title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const doc = new jsPDF({ orientation: keys.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("en-GH")}`, 14, 22);
  autoTable(doc, {
    startY: 27,
    head: [keys],
    body: rows.map((row) => keys.map((key) => String(row[key] ?? ""))),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [13, 27, 62] },
  });
  doc.save(`${filename}.pdf`);
}

function exportWord(filename: string, title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const headerCells = keys
    .map(
      (k) =>
        `<th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;font-weight:bold">${escapeHtml(k)}</th>`,
    )
    .join("");
  const bodyRows = rows
    .map(
      (r) =>
        `<tr>${keys.map((k) => `<td style="border:1px solid #ccc;padding:6px 10px">${escapeHtml(r[k])}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(title)}</title><style>body{font-family:Calibri,Arial;font-size:11pt}h1{color:#0D1B3E}table{border-collapse:collapse;width:100%}th{background:#0D1B3E;color:#fff}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated: ${new Date().toLocaleString("en-GH")} &nbsp;|&nbsp; Infinity Sales &amp; Inventory Management</p><br/><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><br/><p style="font-size:9pt;color:#888">Powered by Infinity Techub Intelligence. All rights reserved (2026).</p></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

function printReport(title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const headerCells = keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("");
  const bodyRows = rows
    .map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Calibri,Arial;font-size:10pt;margin:20px}h1{color:#0D1B3E;margin-bottom:4px}p.meta{font-size:9pt;color:#666;margin-bottom:16px}table{border-collapse:collapse;width:100%}th{background:#0D1B3E;color:#fff;padding:6px 8px;text-align:left;font-size:9pt}td{border:1px solid #ddd;padding:5px 8px;font-size:9pt}tr:nth-child(even){background:#f7f7f7}footer{margin-top:20px;font-size:8pt;color:#999;border-top:1px solid #ddd;padding-top:8px}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><p class="meta">Generated: ${new Date().toLocaleString("en-GH")} | Infinity Sales &amp; Inventory Management</p><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><footer>Powered by Infinity Techub Intelligence. All rights reserved (2026).</footer></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/* ── Reusable export toolbar ─────────────────────────── */
function ExportBar({
  title,
  filename,
  data,
  loading,
}: {
  title: string;
  filename: string;
  data: Record<string, unknown>[];
  loading?: boolean;
}) {
  if (loading)
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  const disabled = !data?.length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Export:</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs rounded-full gap-1 px-2.5"
        disabled={disabled}
        onClick={() => exportCSV(filename, data)}
      >
        <Download className="h-3 w-3" /> CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs rounded-full gap-1 px-2.5"
        disabled={disabled}
        onClick={() => exportExcel(filename, title, data)}
      >
        <FileSpreadsheet className="h-3 w-3 text-green-600" /> Excel
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs rounded-full gap-1 px-2.5"
        disabled={disabled}
        onClick={() => exportPDF(filename, title, data)}
      >
        <FileText className="h-3 w-3 text-red-600" /> PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs rounded-full gap-1 px-2.5"
        disabled={disabled}
        onClick={() => exportWord(filename, title, data)}
      >
        <FileText className="h-3 w-3 text-blue-600" /> Word
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs rounded-full gap-1 px-2.5"
        disabled={disabled}
        onClick={() => printReport(title, data)}
      >
        <Printer className="h-3 w-3" /> Print
      </Button>
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────── */
function StatCard({
  label,
  value,
  sub,
  color = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-bold mt-0.5 ${colors[color] ? colors[color].split(" ")[1] : ""}`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Date range picker ───────────────────────────────── */
function DateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (s: string, e: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        id="report-date-start"
        name="startDate"
        type="date"
        value={startDate}
        onChange={(e) => onChange(e.target.value, endDate)}
        className="rounded-[20px] h-8 text-xs w-36"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        id="report-date-end"
        name="endDate"
        type="date"
        value={endDate}
        onChange={(e) => onChange(startDate, e.target.value)}
        className="rounded-[20px] h-8 text-xs w-36"
      />
    </div>
  );
}

const thisYear = new Date().getFullYear();
const defaultStart = `${thisYear}-01-01`;
const defaultEnd = new Date().toISOString().split("T")[0];

/* ────────────────────────────────────────────────────── */
export default function Reports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  /* ── Date range shared across date-filtered reports ── */
  const [dateRange, setDateRange] = useState({ start: defaultStart, end: defaultEnd });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    customFetch<any>("/api/product-categories")
      .then((d) => setCategories(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setCategories([]));
  }, []);
  const categoryParam =
    categoryFilter === "all" ? "" : `categoryId=${encodeURIComponent(categoryFilter)}`;
  const selectedCategoryName = categories.find((category) => category.id === categoryFilter)?.name;

  /* Coerce to a finite number (defaults to 0). All report-tile renderers
   * call `.toLocaleString()` / `.toFixed()` on these values, so any
   * server response that omits a field would otherwise crash the tab. */
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const mapStockStatus = (s: unknown): string => {
    const v = String(s ?? "").toLowerCase();
    if (v === "out" || v === "out_of_stock") return "out_of_stock";
    if (v === "critical") return "critical";
    if (v === "low") return "low";
    if (v === "ok" || v === "healthy" || v === "") return "healthy";
    return v;
  };

  /* ── P&L ──────────────────────────────────────────── */
  const [pl, setPl] = useState<{
    revenue: number;
    expenses: number;
    grossProfit: number;
    grossMargin: number;
    salesCount: number;
    monthlySales: { month: string; revenue: string }[];
    monthlyExpenses: { month: string; expenses: string }[];
  } | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const loadPl = useCallback(async () => {
    setPlLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/profit-loss?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      );
      setPl({
        revenue: num(d?.revenue),
        expenses: num(d?.expenses),
        grossProfit: num(d?.grossProfit ?? d?.profit),
        grossMargin: num(d?.grossMargin ?? d?.margin),
        salesCount: num(d?.salesCount),
        monthlySales: Array.isArray(d?.monthlySales) ? d.monthlySales : [],
        monthlyExpenses: Array.isArray(d?.monthlyExpenses) ? d.monthlyExpenses : [],
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load P&L" });
    } finally {
      setPlLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  /* ── Inventory Valuation ──────────────────────────── */
  const [invVal, setInvVal] = useState<{
    totalValue: number;
    totalUnits: number;
    totalProducts: number;
    items: {
      id: number;
      name: string;
      category: string | null;
      sku: string | null;
      stock: number;
      unitPrice: number;
      totalValue: number;
      expiryDate: string | null;
    }[];
  } | null>(null);
  const [invValLoading, setInvValLoading] = useState(false);
  const loadInvVal = useCallback(async () => {
    setInvValLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/inventory-valuation${categoryParam ? `?${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((p) => ({
        id: p.id,
        name: p.name ?? "—",
        category: p.category ?? null,
        sku: p.sku ?? null,
        stock: num(p.stock),
        unitPrice: num(p.unitPrice ?? p.price),
        totalValue: num(
          p.totalValue ?? p.retailValue ?? num(p.stock) * num(p.unitPrice ?? p.price),
        ),
        expiryDate: p.expiryDate ?? null,
      }));
      setInvVal({
        totalValue: num(d?.totalValue ?? d?.totalRetail),
        totalUnits: num(d?.totalUnits ?? items.reduce((s, i) => s + i.stock, 0)),
        totalProducts: num(d?.totalProducts ?? d?.count ?? items.length),
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load inventory valuation" });
    } finally {
      setInvValLoading(false);
    }
  }, [categoryFilter]);

  /* ── Stock Report ─────────────────────────────────── */
  const [stock, setStock] = useState<{
    total: number;
    items: {
      id: number;
      name: string;
      category: string | null;
      sku: string | null;
      stock: number;
      price: number;
      reorderPoint: number;
      stockStatus: string;
      expiryDate: string | null;
    }[];
  } | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockFilter, setStockFilter] = useState("all");
  const loadStock = useCallback(async () => {
    setStockLoading(true);
    const q = stockFilter !== "all" ? `?lowStock=true` : "";
    try {
      const d = await customFetch<any>(
        `/api/reports/stock-report${q}${categoryParam ? `${q ? "&" : "?"}${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((p) => ({
        id: p.id,
        name: p.name ?? "—",
        category: p.category ?? null,
        sku: p.sku ?? null,
        stock: num(p.stock),
        price: num(p.price),
        reorderPoint: num(p.reorderPoint ?? p.reorder_level),
        stockStatus: mapStockStatus(p.stockStatus ?? p.status),
        expiryDate: p.expiryDate ?? null,
      }));
      setStock({ total: num(d?.total ?? items.length), items });
    } catch {
      toast({ variant: "destructive", title: "Failed to load stock report" });
    } finally {
      setStockLoading(false);
    }
  }, [stockFilter, categoryFilter]);

  /* ── Expired Inventory ────────────────────────────── */
  const [expired, setExpired] = useState<{
    total: number;
    expiredCount: number;
    expiringSoonCount: number;
    expiredValue: number;
    items: {
      id: number;
      name: string;
      category: string | null;
      sku: string | null;
      stock: number;
      price: number;
      expiryDate: string;
      stockValue: number;
      status: string;
    }[];
  } | null>(null);
  const [expiredLoading, setExpiredLoading] = useState(false);
  const loadExpired = useCallback(async () => {
    setExpiredLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/expired-inventory?alertDays=60${categoryParam ? `&${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((p) => ({
        id: p.id,
        name: p.name ?? "—",
        category: p.category ?? null,
        sku: p.sku ?? null,
        stock: num(p.stock),
        price: num(p.price),
        expiryDate: p.expiryDate ?? "",
        stockValue: num(p.stockValue ?? num(p.stock) * num(p.price)),
        status: p.status === "expiring" ? "expiring_soon" : (p.status ?? "expired"),
      }));
      setExpired({
        total: num(d?.total ?? items.length),
        expiredCount: num(d?.expiredCount ?? items.filter((i) => i.status === "expired").length),
        expiringSoonCount: num(
          d?.expiringSoonCount ?? items.filter((i) => i.status === "expiring_soon").length,
        ),
        expiredValue: num(
          d?.expiredValue ??
            items.filter((i) => i.status === "expired").reduce((s, i) => s + i.stockValue, 0),
        ),
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load expired inventory" });
    } finally {
      setExpiredLoading(false);
    }
  }, [categoryFilter]);

  /* ── Warehouse Report ─────────────────────────────── */
  const [whReport, setWhReport] = useState<{
    warehouses: {
      id: number;
      name: string;
      location: string | null;
      totalProducts: number;
      totalUnits: number;
      totalValue: number;
      items: {
        name: string;
        category: string | null;
        sku: string | null;
        stock: number;
        value: number;
      }[];
    }[];
  } | null>(null);
  const [whLoading, setWhLoading] = useState(false);
  const loadWh = useCallback(async () => {
    setWhLoading(true);
    try {
      const d = await customFetch<any>("/api/reports/warehouse-report");
      const raw: any[] = Array.isArray(d?.warehouses)
        ? d.warehouses
        : Array.isArray(d?.items)
          ? d.items
          : [];
      const warehouses = raw.map((w: any) => ({
        id: w.id,
        name: w.name ?? "—",
        location: w.location ?? null,
        totalProducts: num(w.totalProducts ?? w.productCount),
        totalUnits: num(w.totalUnits ?? w.units),
        totalValue: num(w.totalValue ?? w.retailValue),
        items: Array.isArray(w.items)
          ? w.items.map((i: any) => ({
              name: i.name ?? "—",
              category: i.category ?? null,
              sku: i.sku ?? null,
              stock: num(i.stock),
              value: num(i.value),
            }))
          : [],
      }));
      setWhReport({ warehouses });
    } catch {
      toast({ variant: "destructive", title: "Failed to load warehouse report" });
    } finally {
      setWhLoading(false);
    }
  }, []);

  /* ── Sales Report ─────────────────────────────────── */
  const [salesRpt, setSalesRpt] = useState<{
    totalRevenue: number;
    totalSales: number;
    items: {
      id: number;
      invoiceNumber: string;
      customerName: string | null;
      total: number;
      status: string;
      paymentMethod: string | null;
      saleDate: string;
      channel: string | null;
      categories: string;
    }[];
  } | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/sales?startDate=${dateRange.start}&endDate=${dateRange.end}${categoryParam ? `&${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((s: any) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber ?? s.invoice_number ?? String(s.id ?? ""),
        customerName: s.customerName ?? s.customer_name ?? null,
        total: num(s.total),
        status: String(s.status ?? "completed"),
        paymentMethod: s.paymentMethod ?? s.payment_method ?? null,
        saleDate: s.saleDate ?? s.soldAt ?? s.sold_at ?? "",
        channel: s.channel ?? null,
        categories: Array.isArray(s.categories) ? s.categories.join(", ") : "Other",
      }));
      setSalesRpt({
        totalRevenue: num(d?.totalRevenue),
        totalSales: num(d?.totalSales ?? d?.total ?? items.length),
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load sales report" });
    } finally {
      setSalesLoading(false);
    }
  }, [dateRange.start, dateRange.end, categoryFilter]);

  /* ── Expense Report ───────────────────────────────── */
  const [expenses, setExpenses] = useState<{
    totalExpenses: number;
    totalOrders: number;
    items: {
      id: number;
      poNumber: string;
      supplierName: string;
      status: string;
      total: number;
      createdAt: string;
    }[];
  } | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/expenses?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((e: any) => ({
        id: e.id,
        poNumber: e.poNumber ?? e.po_number ?? e.reference ?? String(e.id ?? ""),
        supplierName: e.supplierName ?? e.supplier_name ?? e.vendor ?? e.category ?? "—",
        status: String(e.status ?? "completed"),
        total: num(e.total ?? e.amount),
        createdAt: e.createdAt ?? e.created_at ?? e.spentAt ?? e.spent_at ?? "",
      }));
      setExpenses({
        totalExpenses: num(d?.totalExpenses ?? d?.total),
        totalOrders: num(d?.totalOrders ?? d?.count ?? items.length),
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load expenses" });
    } finally {
      setExpensesLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  /* ── Deposit Report ───────────────────────────────── */
  const [deposits, setDeposits] = useState<{
    totalDeposits: number;
    totalTransactions: number;
    byPaymentMethod: Record<string, { count: number; total: number }>;
    items: {
      id: number;
      invoiceNumber: string;
      customerName: string | null;
      total: number;
      paymentMethod: string | null;
      saleDate: string;
      channel: string | null;
    }[];
  } | null>(null);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const loadDeposits = useCallback(async () => {
    setDepositsLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/deposits?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((s: any) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber ?? s.invoice_number ?? String(s.id ?? ""),
        customerName: s.customerName ?? s.customer_name ?? null,
        total: num(s.total ?? s.paid),
        paymentMethod: s.paymentMethod ?? s.payment_method ?? null,
        saleDate: s.saleDate ?? s.sold_at ?? "",
        channel: s.channel ?? null,
      }));
      let byPaymentMethod: Record<string, { count: number; total: number }> = {};
      if (d?.byPaymentMethod && typeof d.byPaymentMethod === "object") {
        for (const [k, v] of Object.entries(d.byPaymentMethod as Record<string, any>)) {
          byPaymentMethod[k] = { count: num((v as any)?.count), total: num((v as any)?.total) };
        }
      } else if (d?.byMethod && typeof d.byMethod === "object") {
        for (const [k, v] of Object.entries(d.byMethod as Record<string, any>)) {
          byPaymentMethod[k] = { count: 0, total: num(v) };
        }
      }
      setDeposits({
        totalDeposits: num(d?.totalDeposits ?? d?.total),
        totalTransactions: num(d?.totalTransactions ?? d?.count ?? items.length),
        byPaymentMethod,
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load deposits" });
    } finally {
      setDepositsLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  /* ── Customer Report ──────────────────────────────── */
  const [custRpt, setCustRpt] = useState<{
    total: number;
    totalRevenue: number;
    items: {
      id: number;
      name: string;
      email: string;
      phone: string | null;
      company: string | null;
      city: string | null;
      totalSpend: number;
      totalOrders: number;
      lastOrderDate: string | null;
    }[];
  } | null>(null);
  const [custLoading, setCustLoading] = useState(false);
  const loadCust = useCallback(async () => {
    setCustLoading(true);
    try {
      const d = await customFetch<any>("/api/reports/customers");
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((c: any) => ({
        id: c.id,
        name: c.name ?? "—",
        email: c.email ?? "",
        phone: c.phone ?? null,
        company: c.company ?? null,
        city: c.city ?? null,
        totalSpend: num(c.totalSpend),
        totalOrders: num(c.totalOrders),
        lastOrderDate: c.lastOrderDate ?? c.createdAt ?? null,
      }));
      setCustRpt({
        total: num(d?.total ?? items.length),
        totalRevenue: num(d?.totalRevenue ?? items.reduce((s, c) => s + c.totalSpend, 0)),
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load customer report" });
    } finally {
      setCustLoading(false);
    }
  }, []);

  /* ── User Report ──────────────────────────────────── */
  const [usersRpt, setUsersRpt] = useState<{
    total: number;
    adminCount: number;
    userCount: number;
    activeCount: number;
    users: {
      id: number;
      name: string;
      email: string;
      role: string;
      city: string | null;
      twoFactorEnabled: boolean;
      isLocked: boolean;
      createdAt: string;
    }[];
  } | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const d = await customFetch<any>("/api/reports/users");
      const rawUsers: any[] = Array.isArray(d?.users)
        ? d.users
        : Array.isArray(d?.items)
          ? d.items
          : [];
      const users = rawUsers.map((u: any) => ({
        id: u.id,
        name: u.name ?? u.email ?? "—",
        email: u.email ?? "",
        role: u.role ?? "user",
        city: u.city ?? null,
        twoFactorEnabled: !!u.twoFactorEnabled,
        isLocked: !!u.isLocked,
        createdAt: u.createdAt ?? u.created_at ?? "",
      }));
      setUsersRpt({
        total: num(d?.total ?? users.length),
        adminCount: num(d?.adminCount ?? users.filter((u) => u.role === "admin").length),
        userCount: num(d?.userCount ?? users.filter((u) => u.role !== "admin").length),
        activeCount: num(d?.activeCount ?? users.filter((u) => !u.isLocked).length),
        users,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load user report" });
    } finally {
      setUsersLoading(false);
    }
  }, []);

  /* ── Cashier Performance ──────────────────────────── */
  type CashierPerf = {
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalSales: number;
    activeCashiers: number;
    cashiers: {
      id: number;
      name: string;
      email: string;
      role: string;
      salesCount: number;
      revenue: number;
      avgSale: number;
      maxSale: number;
      minSale: number;
      paymentMethods: Record<string, { count: number; total: number }>;
    }[];
  };
  const [cashierRpt, setCashierRpt] = useState<CashierPerf | null>(null);
  const [cashierLoading, setCashierLoading] = useState(false);
  const loadCashier = useCallback(async () => {
    setCashierLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/cashier-performance?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      );
      const rawCashiers: any[] = Array.isArray(d?.cashiers)
        ? d.cashiers
        : Array.isArray(d?.items)
          ? d.items
          : [];
      const cashiers = rawCashiers.map((c: any, idx: number) => {
        const salesCount = num(c.salesCount ?? c.totalSales);
        const revenue = num(c.revenue ?? c.totalRevenue);
        const pm: Record<string, { count: number; total: number }> = {};
        if (c.paymentMethods && typeof c.paymentMethods === "object") {
          for (const [k, v] of Object.entries(c.paymentMethods as Record<string, any>)) {
            pm[k] = { count: num((v as any)?.count), total: num((v as any)?.total) };
          }
        }
        return {
          id: c.id ?? idx,
          name: c.name ?? c.cashier ?? "—",
          email: c.email ?? "",
          role: c.role ?? "user",
          salesCount,
          revenue,
          avgSale: num(c.avgSale ?? (salesCount > 0 ? revenue / salesCount : 0)),
          maxSale: num(c.maxSale),
          minSale: num(c.minSale),
          paymentMethods: pm,
        };
      });
      setCashierRpt({
        startDate: String(d?.startDate ?? dateRange.start),
        endDate: String(d?.endDate ?? dateRange.end),
        totalRevenue: num(d?.totalRevenue ?? cashiers.reduce((s, c) => s + c.revenue, 0)),
        totalSales: num(
          d?.totalSales ?? d?.total ?? cashiers.reduce((s, c) => s + c.salesCount, 0),
        ),
        activeCashiers: num(d?.activeCashiers ?? cashiers.filter((c) => c.salesCount > 0).length),
        cashiers,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load cashier report" });
    } finally {
      setCashierLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  /* ── Purchase Report ─────────────────────────────── */
  type PurchaseReport = {
    totalOrders: number;
    totalSpend: number;
    received: number;
    pending: number;
    avgOrderValue: number;
    monthly: { month: string; monthKey: string; total: number; orders: number }[];
    bySupplier: { supplierName: string; total: number; orders: number }[];
    byStatus: { status: string; count: number; total: number }[];
    items: {
      id: number;
      poNumber: string;
      supplierName: string;
      status: string;
      subtotal: number;
      tax: number;
      total: number;
      notes: string | null;
      expectedDate: string | null;
      receivedDate: string | null;
      createdAt: string;
      itemCount: number;
      categories: string;
    }[];
  };
  const [purchRpt, setPurchRpt] = useState<PurchaseReport | null>(null);
  const [purchLoading, setPurchLoading] = useState(false);
  const loadPurch = useCallback(async () => {
    setPurchLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/purchases?startDate=${dateRange.start}&endDate=${dateRange.end}${categoryParam ? `&${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((p: any, idx: number) => ({
        id: p.id ?? idx,
        poNumber: p.poNumber ?? p.po_number ?? String(p.id ?? ""),
        supplierName: p.supplierName ?? p.supplier_name ?? "—",
        status: String(p.status ?? "pending"),
        subtotal: num(p.subtotal),
        tax: num(p.tax),
        total: num(p.total),
        notes: p.notes ?? null,
        expectedDate: p.expectedDate ?? p.expected_at ?? null,
        receivedDate: p.receivedDate ?? p.received_at ?? null,
        createdAt: p.createdAt ?? p.created_at ?? p.orderedAt ?? p.ordered_at ?? "",
        itemCount: num(p.itemCount),
        categories: Array.isArray(p.categories) ? p.categories.join(", ") : "Other",
      }));
      const totalOrders = num(d?.totalOrders ?? items.length);
      const totalSpend = num(d?.totalSpend ?? items.reduce((s, i) => s + i.total, 0));
      setPurchRpt({
        totalOrders,
        totalSpend,
        received: num(d?.received),
        pending: num(d?.pending),
        avgOrderValue: num(d?.avgOrderValue ?? (totalOrders > 0 ? totalSpend / totalOrders : 0)),
        monthly: Array.isArray(d?.monthly) ? d.monthly : [],
        bySupplier: Array.isArray(d?.bySupplier) ? d.bySupplier : [],
        byStatus: Array.isArray(d?.byStatus) ? d.byStatus : [],
        items,
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to load purchase report" });
    } finally {
      setPurchLoading(false);
    }
  }, [dateRange.start, dateRange.end, categoryFilter]);

  /* ── Low-stock / quantity alerts ─────────────────── */
  const [alerts, setAlerts] = useState<{
    total: number;
    items: {
      name: string;
      category: string | null;
      sku: string | null;
      stock: number;
      reorderPoint: number;
      stockStatus: string;
      price: number;
    }[];
  } | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const d = await customFetch<any>(
        `/api/reports/stock-report?lowStock=true${categoryParam ? `&${categoryParam}` : ""}`,
      );
      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      const items = rawItems.map((p: any) => ({
        name: p.name ?? "—",
        category: p.category ?? null,
        sku: p.sku ?? null,
        stock: num(p.stock),
        reorderPoint: num(p.reorderPoint ?? p.reorder_level),
        stockStatus: mapStockStatus(p.stockStatus ?? p.status),
        price: num(p.price),
      }));
      setAlerts({ total: num(d?.total ?? items.length), items });
    } catch {
      toast({ variant: "destructive", title: "Failed to load alerts" });
    } finally {
      setAlertsLoading(false);
    }
  }, [categoryFilter]);

  const [categorySummary, setCategorySummary] = useState<any[] | null>(null);
  const [categorySummaryLoading, setCategorySummaryLoading] = useState(false);
  const loadCategorySummary = useCallback(async () => {
    setCategorySummaryLoading(true);
    try {
      const response = await customFetch<any>(
        `/api/reports/category-summary?startDate=${dateRange.start}&endDate=${dateRange.end}`,
      );
      const rows = Array.isArray(response?.data) ? response.data : [];
      setCategorySummary(
        categoryFilter === "all"
          ? rows
          : rows.filter((row: any) => row.categoryId === categoryFilter),
      );
    } catch {
      toast({ variant: "destructive", title: "Failed to load category analysis" });
    } finally {
      setCategorySummaryLoading(false);
    }
  }, [dateRange.start, dateRange.end, categoryFilter]);

  const handleTabChange = (tab: string) => {
    if (tab === "pl" && !pl) loadPl();
    else if (tab === "inventory" && !invVal) loadInvVal();
    else if (tab === "stock" && !stock) loadStock();
    else if (tab === "expired" && !expired) loadExpired();
    else if (tab === "warehouse" && !whReport) loadWh();
    else if (tab === "sales" && !salesRpt) loadSales();
    else if (tab === "expenses" && !expenses) loadExpenses();
    else if (tab === "deposits" && !deposits) loadDeposits();
    else if (tab === "customers" && !custRpt) loadCust();
    else if (tab === "users" && !usersRpt && isAdmin) loadUsers();
    else if (tab === "alerts" && !alerts) loadAlerts();
    else if (tab === "purchases" && !purchRpt) loadPurch();
    else if (tab === "cashier" && !cashierRpt) loadCashier();
    else if (tab === "categories" && !categorySummary) loadCategorySummary();
  };

  const PIE_COLORS = ["#0D1B3E", "#7B2D42", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];
  const statusBadge = (s: string | null | undefined) => {
    const key = String(s ?? "").toLowerCase();
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-700",
      pending: "bg-amber-100 text-amber-700",
      cancelled: "bg-red-100 text-red-700",
      received: "bg-blue-100 text-blue-700",
      ordered: "bg-violet-100 text-violet-700",
      draft: "bg-slate-100 text-slate-600",
      healthy: "bg-green-100 text-green-700",
      low: "bg-amber-100 text-amber-700",
      critical: "bg-red-100 text-red-700",
      out_of_stock: "bg-red-200 text-red-800",
      expired: "bg-red-200 text-red-800",
      expiring_soon: "bg-amber-100 text-amber-700",
    };
    return (
      <Badge className={`${map[key] ?? "bg-slate-100 text-slate-600"} border-0 text-[10px]`}>
        {key ? key.replace(/_/g, " ") : "—"}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-muted-foreground">
            Comprehensive business reports with multi-format export.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={categoryFilter}
            onValueChange={(value) => {
              setCategoryFilter(value);
              setInvVal(null);
              setStock(null);
              setExpired(null);
              setAlerts(null);
              setSalesRpt(null);
              setPurchRpt(null);
              setCategorySummary(null);
            }}
          >
            <SelectTrigger className="h-8 w-48 rounded-full">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRange
            startDate={dateRange.start}
            endDate={dateRange.end}
            onChange={(s, e) => setDateRange({ start: s, end: e })}
          />
        </div>
        {selectedCategoryName && (
          <p className="w-full text-xs text-muted-foreground text-right">
            Report criteria: Category — {selectedCategoryName}
          </p>
        )}
      </div>

      <Tabs defaultValue="sales" onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl w-full justify-start">
          {[
            { v: "sales", icon: BarChart2, label: "Sales" },
            { v: "categories", icon: Package, label: "Categories" },
            { v: "pl", icon: TrendingUp, label: "P&L" },
            { v: "inventory", icon: Package, label: "Inventory Valuation" },
            { v: "stock", icon: Package, label: "Stock" },
            { v: "warehouse", icon: Warehouse, label: "Warehouse" },
            { v: "alerts", icon: AlertTriangle, label: "Qty Alerts" },
            { v: "expired", icon: CalendarCheck, label: "Expired" },
            { v: "expenses", icon: ShoppingBag, label: "Expenses" },
            { v: "purchases", icon: Truck, label: "Purchases" },
            { v: "deposits", icon: CreditCard, label: "Deposits" },
            { v: "customers", icon: Users, label: "Customers" },
            ...(isAdmin ? [{ v: "users", icon: UserCheck, label: "Users" }] : []),
            { v: "cashier", icon: UserCheck, label: "Cashier" },
          ].map(({ v, icon: Icon, label }) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-lg text-xs h-8 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── SALES REPORT ────────────────────────────── */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" /> Sales Report
                </CardTitle>
                <CardDescription>All sales transactions for selected period</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 gap-1.5"
                  onClick={loadSales}
                  disabled={salesLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Sales Report"
                  filename="sales-report"
                  loading={salesLoading}
                  data={(salesRpt?.items ?? []).map((s) => ({
                    "Invoice #": s.invoiceNumber,
                    Customer: s.customerName ?? "Walk-in",
                    Categories: s.categories,
                    Amount: GHS(s.total),
                    Status: s.status,
                    "Payment Method": s.paymentMethod ?? "—",
                    Channel: s.channel ?? "online",
                    Date: fmtDate(s.saleDate),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {salesRpt && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard
                    label="Total Revenue"
                    value={GHS(salesRpt.totalRevenue)}
                    color="green"
                  />
                  <StatCard label="Total Sales" value={salesRpt.totalSales.toLocaleString()} />
                  <StatCard
                    label="Avg Sale Value"
                    value={
                      salesRpt.totalSales > 0
                        ? GHS(salesRpt.totalRevenue / salesRpt.totalSales)
                        : GHS(0)
                    }
                  />
                </div>
              )}
              {salesLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Categories</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(salesRpt?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-12"
                          >
                            No data — click Refresh or adjust the date range
                          </TableCell>
                        </TableRow>
                      ) : (
                        (salesRpt?.items ?? []).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                            <TableCell>
                              {s.customerName ?? (
                                <span className="text-muted-foreground">Walk-in</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{s.categories}</TableCell>
                            <TableCell className="font-semibold">{GHS(s.total)}</TableCell>
                            <TableCell>{statusBadge(s.status)}</TableCell>
                            <TableCell className="capitalize">{s.paymentMethod ?? "—"}</TableCell>
                            <TableCell className="capitalize">{s.channel ?? "online"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(s.saleDate)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle>Product Category Analysis</CardTitle>
                <CardDescription>
                  Sales, purchases, stock quantity, low stock, and inventory value grouped by
                  category
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadCategorySummary}
                  disabled={categorySummaryLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title={`Category Analysis${selectedCategoryName ? ` — ${selectedCategoryName}` : ""}`}
                  filename="category-analysis"
                  loading={categorySummaryLoading}
                  data={(categorySummary ?? []).map((row) => ({
                    Category: row.category,
                    "Product Count": row.productCount,
                    "Stock Quantity": row.stockQuantity,
                    "Low Stock Products": row.lowStockCount,
                    "Inventory Cost Value": GHS(row.inventoryCostValue),
                    "Inventory Retail Value": GHS(row.inventoryRetailValue),
                    "Units Sold": row.unitsSold,
                    "Sales Value": GHS(row.salesValue),
                    "Purchased Quantity": row.purchaseQuantity,
                    "Purchase Value": GHS(row.purchaseValue),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent>
              {categorySummaryLoading ? (
                <div className="h-52 bg-muted animate-pulse rounded-xl" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={categorySummary ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number) => GHS(value)} />
                      <Legend />
                      <Bar dataKey="salesValue" name="Sales" fill="#22c55e" />
                      <Bar dataKey="purchaseValue" name="Purchases" fill="#7B2D42" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Products</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Low Stock</TableHead>
                          <TableHead className="text-right">Inventory Value</TableHead>
                          <TableHead className="text-right">Sales</TableHead>
                          <TableHead className="text-right">Purchases</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(categorySummary ?? []).map((row) => (
                          <TableRow key={row.categoryId}>
                            <TableCell className="font-medium">{row.category}</TableCell>
                            <TableCell className="text-right">{row.productCount}</TableCell>
                            <TableCell className="text-right">{row.stockQuantity}</TableCell>
                            <TableCell className="text-right">{row.lowStockCount}</TableCell>
                            <TableCell className="text-right">
                              {GHS(row.inventoryRetailValue)}
                            </TableCell>
                            <TableCell className="text-right">{GHS(row.salesValue)}</TableCell>
                            <TableCell className="text-right">{GHS(row.purchaseValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── P&L ─────────────────────────────────────── */}
        <TabsContent value="pl" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Profit & Loss Report
                </CardTitle>
                <CardDescription>Revenue vs expenses with gross margin analysis</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 gap-1.5"
                  onClick={loadPl}
                  disabled={plLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Profit and Loss Report"
                  filename="profit-loss-report"
                  loading={plLoading}
                  data={
                    pl
                      ? [
                          {
                            "Period Start": dateRange.start,
                            "Period End": dateRange.end,
                            Revenue: GHS(pl.revenue),
                            Expenses: GHS(pl.expenses),
                            "Gross Profit": GHS(pl.grossProfit),
                            "Gross Margin %": `${pl.grossMargin.toFixed(1)}%`,
                          },
                        ]
                      : []
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {plLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : pl ? (
                <>
                  <div className="flex gap-4 flex-wrap">
                    <StatCard
                      label="Total Revenue"
                      value={GHS(pl.revenue)}
                      color="green"
                      sub={`${pl.salesCount} completed sales`}
                    />
                    <StatCard label="Total Expenses" value={GHS(pl.expenses)} color="red" />
                    <StatCard
                      label="Gross Profit"
                      value={GHS(pl.grossProfit)}
                      color={pl.grossProfit >= 0 ? "green" : "red"}
                    />
                    <StatCard
                      label="Gross Margin"
                      value={`${pl.grossMargin.toFixed(1)}%`}
                      color={pl.grossMargin >= 30 ? "green" : pl.grossMargin >= 0 ? "amber" : "red"}
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold mb-3">Monthly Revenue vs Expenses</p>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={pl.monthlySales.map((m) => ({
                              month: m.month,
                              Revenue: Number(m.revenue),
                              Expenses: Number(
                                (
                                  pl.monthlyExpenses.find((e) => e.month === m.month) as
                                    | { month: string; expenses: string }
                                    | undefined
                                )?.expenses ?? 0,
                              ),
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis
                              tickFormatter={(v) => `₵${(v as number) / 1000}k`}
                              tick={{ fontSize: 10 }}
                            />
                            <Tooltip formatter={(v: number) => GHS(v)} />
                            <Legend />
                            <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">P&L Summary</p>
                      {[
                        { label: "Gross Revenue", value: GHS(pl.revenue), color: "text-green-600" },
                        {
                          label: "Total Expenses (COGS / POs)",
                          value: `− ${GHS(pl.expenses)}`,
                          color: "text-red-500",
                        },
                        {
                          label: "Gross Profit",
                          value: GHS(pl.grossProfit),
                          color:
                            pl.grossProfit >= 0
                              ? "text-green-700 font-bold"
                              : "text-red-600 font-bold",
                          border: true,
                        },
                        {
                          label: "Gross Margin",
                          value: `${pl.grossMargin.toFixed(1)}%`,
                          color: "text-muted-foreground",
                        },
                      ].map(({ label, value, color, border }) => (
                        <div
                          key={label}
                          className={`flex justify-between py-2 ${border ? "border-t border-dashed" : ""}`}
                        >
                          <span className="text-sm text-muted-foreground">{label}</span>
                          <span className={`text-sm ${color}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-muted-foreground border rounded-xl border-dashed">
                  Click Refresh to load P&L data for the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INVENTORY VALUATION ──────────────────────── */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" /> Inventory Valuation Report
                </CardTitle>
                <CardDescription>
                  Total stock value across all products at current unit prices
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadInvVal}
                  disabled={invValLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Inventory Valuation Report"
                  filename="inventory-valuation"
                  loading={invValLoading}
                  data={(invVal?.items ?? []).map((p) => ({
                    Product: p.name,
                    Category: p.category ?? "—",
                    SKU: p.sku ?? "—",
                    "Units in Stock": p.stock,
                    "Unit Price": GHS(p.unitPrice),
                    "Total Value": GHS(p.totalValue),
                    "Expiry Date": fmtDate(p.expiryDate),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {invVal && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard
                    label="Total Inventory Value"
                    value={GHS(invVal.totalValue)}
                    color="green"
                  />
                  <StatCard label="Total Units" value={invVal.totalUnits.toLocaleString()} />
                  <StatCard label="Total Products" value={invVal.totalProducts.toLocaleString()} />
                  <StatCard
                    label="Avg Product Value"
                    value={
                      invVal.totalProducts > 0
                        ? GHS(invVal.totalValue / invVal.totalProducts)
                        : GHS(0)
                    }
                  />
                </div>
              )}
              {invValLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invVal?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-12"
                          >
                            No data — click Refresh
                          </TableCell>
                        </TableRow>
                      ) : (
                        (invVal?.items ?? []).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-sm">{p.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.category ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                            <TableCell className="text-right">{p.stock.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{GHS(p.unitPrice)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {GHS(p.totalValue)}
                            </TableCell>
                            <TableCell className="text-xs">{fmtDate(p.expiryDate)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── STOCK REPORT ─────────────────────────────── */}
        <TabsContent value="stock" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" /> Stock Report
                </CardTitle>
                <CardDescription>Current stock levels and status for all products</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={stockFilter} onValueChange={(v) => setStockFilter(v)}>
                  <SelectTrigger className="rounded-full h-8 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="low">Low & Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadStock}
                  disabled={stockLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Stock Report"
                  filename="stock-report"
                  loading={stockLoading}
                  data={(stock?.items ?? []).map((p) => ({
                    Product: p.name,
                    Category: p.category ?? "—",
                    SKU: p.sku ?? "—",
                    "In Stock": p.stock,
                    "Reorder Point": p.reorderPoint,
                    Status: p.stockStatus,
                    "Unit Price": GHS(p.price),
                    "Expiry Date": fmtDate(p.expiryDate),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent>
              {stockLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">In Stock</TableHead>
                        <TableHead className="text-right">Reorder Point</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stock?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-12"
                          >
                            No data — click Refresh
                          </TableCell>
                        </TableRow>
                      ) : (
                        (stock?.items ?? []).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-sm">{p.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.category ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {p.stock.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {p.reorderPoint}
                            </TableCell>
                            <TableCell>{statusBadge(p.stockStatus)}</TableCell>
                            <TableCell className="text-right">{GHS(p.price)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WAREHOUSE REPORT ─────────────────────────── */}
        <TabsContent value="warehouse" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Stock distribution and value per warehouse location
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8"
                onClick={loadWh}
                disabled={whLoading}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <ExportBar
                title="Warehouse Report"
                filename="warehouse-report"
                loading={whLoading}
                data={(whReport?.warehouses ?? []).flatMap((wh) =>
                  wh.items.map((i) => ({
                    Warehouse: wh.name,
                    Location: wh.location ?? "—",
                    Product: i.name,
                    Category: i.category ?? "—",
                    SKU: i.sku ?? "—",
                    Units: i.stock,
                    Value: GHS(i.value),
                  })),
                )}
              />
            </div>
          </div>
          {whLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-xl" />
          ) : (
            <div className="space-y-4">
              {(whReport?.warehouses ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No data — click Refresh
                  </CardContent>
                </Card>
              ) : (
                (whReport?.warehouses ?? []).map((wh) => (
                  <Card key={wh.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-primary" />
                          {wh.name}
                          {wh.location && (
                            <span className="text-xs font-normal text-muted-foreground">
                              — {wh.location}
                            </span>
                          )}
                        </CardTitle>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>
                            <strong>{wh.totalProducts}</strong> products
                          </span>
                          <span>
                            <strong>{wh.totalUnits.toLocaleString()}</strong> units
                          </span>
                          <span className="text-primary font-semibold">{GHS(wh.totalValue)}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Units</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wh.items.slice(0, 10).map((i, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-sm">{i.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {i.category ?? "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {i.stock.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-primary">
                                {GHS(i.value)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {wh.items.length > 10 && (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-xs text-center text-muted-foreground py-2"
                              >
                                +{wh.items.length - 10} more — export for full list
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* ── PRODUCT QUANTITY ALERTS ───────────────────── */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Product Quantity Alerts
                </CardTitle>
                <CardDescription>Products at or below their reorder threshold</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadAlerts}
                  disabled={alertsLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Product Quantity Alerts"
                  filename="quantity-alerts"
                  loading={alertsLoading}
                  data={(alerts?.items ?? []).map((p) => ({
                    Product: p.name,
                    Category: p.category ?? "—",
                    SKU: p.sku ?? "—",
                    "In Stock": p.stock,
                    "Reorder Point": p.reorderPoint,
                    Status: p.stockStatus,
                    "Unit Price": GHS(p.price),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertsLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded-xl" />
              ) : (alerts?.items ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground border rounded-xl border-dashed">
                  No alerts — click Refresh or all products are adequately stocked
                </div>
              ) : (
                (alerts?.items ?? []).map((p, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${p.stockStatus === "out_of_stock" ? "bg-red-50 dark:bg-red-950/20 border-red-200" : p.stockStatus === "critical" ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200"}`}
                  >
                    <AlertTriangle
                      className={`h-4 w-4 flex-shrink-0 ${p.stockStatus === "out_of_stock" || p.stockStatus === "critical" ? "text-red-500" : "text-amber-500"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.category ?? "—"}
                        {p.sku ? ` · ${p.sku}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold">
                        {p.stock} / {p.reorderPoint}
                      </p>
                      <p className="text-[10px] text-muted-foreground">stock / min</p>
                    </div>
                    {statusBadge(p.stockStatus)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EXPIRED INVENTORY ─────────────────────────── */}
        <TabsContent value="expired" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-red-500" /> Expired Inventory Report
                </CardTitle>
                <CardDescription>
                  Products that are expired or expiring within 60 days
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadExpired}
                  disabled={expiredLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Expired Inventory Report"
                  filename="expired-inventory"
                  loading={expiredLoading}
                  data={(expired?.items ?? []).map((p) => ({
                    Product: p.name,
                    Category: p.category ?? "—",
                    SKU: p.sku ?? "—",
                    "In Stock": p.stock,
                    "Unit Price": GHS(p.price),
                    "Stock Value": GHS(p.stockValue),
                    "Expiry Date": fmtDate(p.expiryDate),
                    Status: p.status,
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {expired && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard
                    label="Expired Items"
                    value={expired.expiredCount.toString()}
                    color="red"
                  />
                  <StatCard
                    label="Expiring Soon"
                    value={expired.expiringSoonCount.toString()}
                    color="amber"
                  />
                  <StatCard
                    label="Expired Stock Value"
                    value={GHS(expired.expiredValue)}
                    color="red"
                  />
                </div>
              )}
              {expiredLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded-xl" />
              ) : (expired?.items ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground border rounded-xl border-dashed">
                  No expired or expiring-soon products — click Refresh
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Stock Value</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(expired?.items ?? []).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium text-sm">{p.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.category ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                          <TableCell className="text-right">{p.stock.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">
                            {GHS(p.stockValue)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {fmtDate(p.expiryDate)}
                          </TableCell>
                          <TableCell>{statusBadge(p.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EXPENSE REPORT ─────────────────────────────── */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" /> Expense Report
                </CardTitle>
                <CardDescription>
                  Purchase orders and procurement expenses for selected period
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadExpenses}
                  disabled={expensesLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Expense Report"
                  filename="expense-report"
                  loading={expensesLoading}
                  data={(expenses?.items ?? []).map((e) => ({
                    "PO #": e.poNumber,
                    Supplier: e.supplierName,
                    Status: e.status,
                    "Total Amount": GHS(e.total),
                    Date: fmtDate(e.createdAt),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {expenses && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard
                    label="Total Expenses"
                    value={GHS(expenses.totalExpenses)}
                    color="red"
                  />
                  <StatCard label="Purchase Orders" value={expenses.totalOrders.toString()} />
                  <StatCard
                    label="Avg PO Value"
                    value={
                      expenses.totalOrders > 0
                        ? GHS(expenses.totalExpenses / expenses.totalOrders)
                        : GHS(0)
                    }
                  />
                </div>
              )}
              {expensesLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO #</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(expenses?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-muted-foreground py-12"
                          >
                            No expenses — click Refresh or adjust date range
                          </TableCell>
                        </TableRow>
                      ) : (
                        (expenses?.items ?? []).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-xs">{e.poNumber}</TableCell>
                            <TableCell className="font-medium text-sm">{e.supplierName}</TableCell>
                            <TableCell>{statusBadge(e.status)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {GHS(e.total)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(e.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PURCHASE REPORT ────────────────────────────── */}
        <TabsContent value="purchases" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> Purchase Report
                </CardTitle>
                <CardDescription>
                  Purchase orders placed with suppliers for the selected period
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 gap-1.5"
                  onClick={loadPurch}
                  disabled={purchLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Purchase Report"
                  filename="purchase-report"
                  loading={purchLoading}
                  data={(purchRpt?.items ?? []).map((p) => ({
                    "PO Number": p.poNumber,
                    Supplier: p.supplierName,
                    Status: p.status,
                    Items: p.itemCount,
                    Categories: p.categories,
                    Subtotal: GHS(p.subtotal),
                    Tax: GHS(p.tax),
                    Total: GHS(p.total),
                    "Expected Date": fmtDate(p.expectedDate),
                    "Received Date": fmtDate(p.receivedDate),
                    Created: fmtDate(p.createdAt),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* KPI strip */}
              {purchRpt && (
                <div className="flex gap-4 flex-wrap">
                  <StatCard label="Total Orders" value={purchRpt.totalOrders.toLocaleString()} />
                  <StatCard label="Total Spend" value={GHS(purchRpt.totalSpend)} color="red" />
                  <StatCard label="Avg Order Value" value={GHS(purchRpt.avgOrderValue)} />
                  <StatCard
                    label="Received"
                    value={purchRpt.received.toLocaleString()}
                    color="green"
                  />
                  <StatCard
                    label="Pending / Draft"
                    value={purchRpt.pending.toLocaleString()}
                    color="amber"
                  />
                </div>
              )}

              {/* Monthly spend chart */}
              {purchLoading ? (
                <div className="h-52 bg-muted animate-pulse rounded-xl" />
              ) : (
                (purchRpt?.monthly ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Monthly Spend</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={purchRpt!.monthly}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip formatter={(v: number) => GHS(v)} />
                        <Bar dataKey="total" name="Spend" fill="#7B2D42" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              )}

              {/* Supplier breakdown + Status breakdown side by side */}
              {purchRpt && purchRpt.bySupplier.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top suppliers */}
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">
                      Top Suppliers by Spend
                    </p>
                    <div className="space-y-2">
                      {purchRpt.bySupplier.map((s) => {
                        const pct =
                          purchRpt.totalSpend > 0 ? (s.total / purchRpt.totalSpend) * 100 : 0;
                        return (
                          <div key={s.supplierName}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="font-medium truncate max-w-[180px]">
                                {s.supplierName}
                              </span>
                              <span className="text-muted-foreground">
                                {GHS(s.total)} · {s.orders} PO{s.orders !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#7B2D42] rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Status breakdown */}
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">
                      Orders by Status
                    </p>
                    <div className="space-y-2.5">
                      {purchRpt.byStatus.map((s) => (
                        <div key={s.status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {statusBadge(s.status)}
                            <span className="text-xs text-muted-foreground">
                              {s.count} order{s.count !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <span className="text-xs font-semibold">{GHS(s.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Orders table */}
              {purchLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Items</TableHead>
                        <TableHead>Categories</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(purchRpt?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={10}
                            className="text-center text-muted-foreground py-12"
                          >
                            No purchase orders — click Refresh or adjust date range
                          </TableCell>
                        </TableRow>
                      ) : (
                        (purchRpt?.items ?? []).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
                            <TableCell className="font-medium text-sm">{p.supplierName}</TableCell>
                            <TableCell>{statusBadge(p.status)}</TableCell>
                            <TableCell className="text-center text-xs">{p.itemCount}</TableCell>
                            <TableCell className="text-xs">{p.categories}</TableCell>
                            <TableCell className="text-right text-xs">{GHS(p.subtotal)}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {GHS(p.tax)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-[#7B2D42]">
                              {GHS(p.total)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(p.expectedDate)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(p.receivedDate)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(p.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DEPOSIT REPORT ─────────────────────────────── */}
        <TabsContent value="deposits" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-green-600" /> Deposit Report
                </CardTitle>
                <CardDescription>All completed sales payments / deposits received</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadDeposits}
                  disabled={depositsLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Deposit Report"
                  filename="deposit-report"
                  loading={depositsLoading}
                  data={(deposits?.items ?? []).map((d) => ({
                    "Invoice #": d.invoiceNumber,
                    Customer: d.customerName ?? "Walk-in",
                    Amount: GHS(d.total),
                    "Payment Method": d.paymentMethod ?? "cash",
                    Channel: d.channel ?? "online",
                    Date: fmtDate(d.saleDate),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deposits && (
                <>
                  <div className="flex gap-4 flex-wrap mb-2">
                    <StatCard
                      label="Total Deposits"
                      value={GHS(deposits.totalDeposits)}
                      color="green"
                    />
                    <StatCard label="Transactions" value={deposits.totalTransactions.toString()} />
                  </div>
                  {Object.keys(deposits.byPaymentMethod).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {Object.entries(deposits.byPaymentMethod).map(([method, data]) => (
                        <div key={method} className="p-3 rounded-xl border bg-muted/10 text-center">
                          <p className="text-sm font-bold">{GHS(data.total)}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {method.replace(/_/g, " ")}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{data.count} txns</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {depositsLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(deposits?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-muted-foreground py-12"
                          >
                            No deposits — click Refresh or adjust date range
                          </TableCell>
                        </TableRow>
                      ) : (
                        (deposits?.items ?? []).map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{d.invoiceNumber}</TableCell>
                            <TableCell className="text-sm">
                              {d.customerName ?? (
                                <span className="text-muted-foreground">Walk-in</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-green-700">
                              {GHS(d.total)}
                            </TableCell>
                            <TableCell className="capitalize text-xs">
                              {d.paymentMethod ?? "cash"}
                            </TableCell>
                            <TableCell className="capitalize text-xs">
                              {d.channel ?? "online"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(d.saleDate)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CUSTOMER REPORT ────────────────────────────── */}
        <TabsContent value="customers" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Customer Report
                </CardTitle>
                <CardDescription>
                  All customers with lifetime spend and order activity
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadCust}
                  disabled={custLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Customer Report"
                  filename="customer-report"
                  loading={custLoading}
                  data={(custRpt?.items ?? []).map((c) => ({
                    Name: c.name,
                    Email: c.email,
                    Phone: c.phone ?? "—",
                    Company: c.company ?? "—",
                    City: c.city ?? "—",
                    "Total Spend": GHS(c.totalSpend),
                    "Total Orders": c.totalOrders,
                    "Last Order": fmtDate(c.lastOrderDate),
                    Joined: fmtDate(c.lastOrderDate),
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {custRpt && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard label="Total Customers" value={custRpt.total.toString()} />
                  <StatCard label="Total Revenue" value={GHS(custRpt.totalRevenue)} color="green" />
                  <StatCard
                    label="Avg Customer Value"
                    value={custRpt.total > 0 ? GHS(custRpt.totalRevenue / custRpt.total) : GHS(0)}
                  />
                </div>
              )}
              {custLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Total Spend</TableHead>
                        <TableHead>Last Order</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(custRpt?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-12"
                          >
                            No data — click Refresh
                          </TableCell>
                        </TableRow>
                      ) : (
                        (custRpt?.items ?? []).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium text-sm">{c.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.email}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.company ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">{c.city ?? "—"}</TableCell>
                            <TableCell className="text-right">{c.totalOrders}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {GHS(c.totalSpend)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(c.lastOrderDate)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CASHIER PERFORMANCE ─────────────────────────── */}
        <TabsContent value="cashier" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" /> Cashier Performance
                </CardTitle>
                <CardDescription>
                  Sales performance by cashier/staff for selected period
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8"
                  onClick={loadCashier}
                  disabled={cashierLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <ExportBar
                  title="Cashier Performance"
                  filename="cashier-performance"
                  loading={cashierLoading}
                  data={(cashierRpt?.cashiers ?? []).map((c) => ({
                    Name: c.name,
                    Email: c.email,
                    Role: c.role,
                    "Sales Count": c.salesCount,
                    "Total Revenue (GHS)": c.revenue.toFixed(2),
                    "Avg Sale (GHS)": c.avgSale.toFixed(2),
                    "Max Sale (GHS)": c.maxSale.toFixed(2),
                    "Payment Methods":
                      Object.entries(c.paymentMethods)
                        .map(([m, v]) => `${m}:${v.count}`)
                        .join("; ") || "—",
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cashierRpt && (
                <div className="flex gap-4 flex-wrap mb-4">
                  <StatCard label="Total Cashiers" value={cashierRpt.cashiers.length.toString()} />
                  <StatCard
                    label="Active This Period"
                    value={cashierRpt.activeCashiers.toString()}
                    color="green"
                  />
                  <StatCard label="Total Sales" value={cashierRpt.totalSales.toString()} />
                  <StatCard
                    label="Total Revenue"
                    value={GHS(cashierRpt.totalRevenue)}
                    color="green"
                  />
                </div>
              )}
              {cashierLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded-xl" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cashier</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Avg Sale</TableHead>
                        <TableHead className="text-right">Highest Sale</TableHead>
                        <TableHead>Payment Methods</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cashierRpt?.cashiers ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-12"
                          >
                            No data — click Refresh to load
                          </TableCell>
                        </TableRow>
                      ) : (
                        (cashierRpt?.cashiers ?? []).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{c.name}</div>
                              <div className="text-xs text-muted-foreground">{c.email}</div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${c.role === "admin" ? "border-[#7B2D42]/30 text-[#7B2D42]" : "border-primary/20 text-primary"}`}
                              >
                                {c.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {c.salesCount}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {GHS(c.revenue)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {GHS(c.avgSale)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {c.maxSale > 0 ? GHS(c.maxSale) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {Object.keys(c.paymentMethods).length === 0 ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  Object.entries(c.paymentMethods).map(([method, val]) => (
                                    <Badge
                                      key={method}
                                      className="text-[10px] border-0 bg-primary/10 text-primary capitalize"
                                    >
                                      {method.replace(/_/g, " ")}: {val.count}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USER REPORT ─────────────────────────────────── */}
        {isAdmin && (
          <TabsContent value="users" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" /> User Report
                  </CardTitle>
                  <CardDescription>System users, roles, and account status</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full h-8"
                    onClick={loadUsers}
                    disabled={usersLoading}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <ExportBar
                    title="User Report"
                    filename="user-report"
                    loading={usersLoading}
                    data={(usersRpt?.users ?? []).map((u) => ({
                      Name: u.name,
                      Email: u.email,
                      Role: u.role,
                      City: u.city ?? "—",
                      "2FA Enabled": u.twoFactorEnabled ? "Yes" : "No",
                      "Account Locked": u.isLocked ? "Yes" : "No",
                      Joined: fmtDate(u.createdAt),
                    }))}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {usersRpt && (
                  <div className="flex gap-4 flex-wrap mb-4">
                    <StatCard label="Total Users" value={usersRpt.total.toString()} />
                    <StatCard label="Admins" value={usersRpt.adminCount.toString()} color="amber" />
                    <StatCard label="Regular Users" value={usersRpt.userCount.toString()} />
                    <StatCard
                      label="Active Accounts"
                      value={usersRpt.activeCount.toString()}
                      color="green"
                    />
                  </div>
                )}
                {usersLoading ? (
                  <div className="h-32 bg-muted animate-pulse rounded-xl" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>2FA</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(usersRpt?.users ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center text-muted-foreground py-12"
                            >
                              No data — click Refresh
                            </TableCell>
                          </TableRow>
                        ) : (
                          (usersRpt?.users ?? []).map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium text-sm">{u.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {u.email}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${u.role === "admin" ? "border-[#7B2D42]/30 text-[#7B2D42]" : "border-primary/20 text-primary"}`}
                                >
                                  {u.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{u.city ?? "—"}</TableCell>
                              <TableCell>
                                <Badge
                                  className={`text-[10px] border-0 ${u.twoFactorEnabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}
                                >
                                  {u.twoFactorEnabled ? "Enabled" : "Off"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={`text-[10px] border-0 ${u.isLocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                                >
                                  {u.isLocked ? "Locked" : "Active"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {fmtDate(u.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
