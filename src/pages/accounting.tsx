import { useState, useEffect } from "react";
import { customFetch } from "@/workspace/api-client-react";
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
  Banknote,
  RefreshCw,
  Loader2,
} from "lucide-react";
import ExcelJS from "exceljs";
import { format } from "date-fns";

const GHS = (v: number) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : format(dt, "dd MMM yyyy");
};

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

async function exportExcel(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ledger");
  ws.addRow(Object.keys(rows[0]));
  rows.forEach((r) => ws.addRow(Object.values(r).map((v) => v ?? "")));
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

function exportWord(filename: string, title: string, rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] || {});
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>Generated: ${new Date().toLocaleString("en-GH")}</p><table border='1' style='border-collapse:collapse;width:100%'><thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table><p style='font-size:9pt;color:#888'>Powered by Infinity Techub Intelligence. All rights reserved (2026).</p></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

const thisYear = new Date().getFullYear();

export default function Accounting() {
  const [startDate, setStartDate] = useState(`${thisYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [sales, setSales] = useState<
    {
      id: number;
      invoice_number: string;
      customer_name: string | null;
      total: string;
      status: string;
      payment_method: string | null;
      sale_date: string;
      channel: string | null;
    }[]
  >([]);
  const [expenses, setExpenses] = useState<
    {
      id: number;
      po_number: string;
      supplier_name: string;
      status: string;
      total: string;
      created_at: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        customFetch<{ items: typeof sales }>(
          `/api/reports/sales?startDate=${startDate}&endDate=${endDate}`,
        ),
        customFetch<{ items: typeof expenses }>(
          `/api/reports/expenses?startDate=${startDate}&endDate=${endDate}`,
        ),
      ]);
      setSales(s.items ?? []);
      setExpenses(e.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const completedSales = sales.filter((s) => s.status === "completed");
  const totalRevenue = completedSales.reduce((s, r) => s + Number(r.total), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total), 0);
  const netProfit = totalRevenue - totalExpenses;

  const ledgerRows: Record<string, unknown>[] = [
    ...completedSales.map((s) => ({
      Type: "Revenue",
      Ref: s.invoice_number,
      Party: s.customer_name ?? "Walk-in",
      Debit: "",
      Credit: GHS(Number(s.total)),
      Balance: "",
      Date: fmtDate(s.sale_date),
      Notes: s.payment_method ?? "",
    })),
    ...expenses.map((e) => ({
      Type: "Expense",
      Ref: e.po_number,
      Party: e.supplier_name,
      Debit: GHS(Number(e.total)),
      Credit: "",
      Balance: "",
      Date: fmtDate(e.created_at),
      Notes: e.status,
    })),
  ].sort((a, b) => new Date(String(b.Date)).getTime() - new Date(String(a.Date)).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Accounting & Audit</h2>
          <p className="text-muted-foreground">
            General ledger, financial overview, and audit trails.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            id="accounting-date-start"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[20px] h-8 text-xs w-36"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            id="accounting-date-end"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[20px] h-8 text-xs w-36"
          />
          <Button
            size="sm"
            variant="outline"
            className="rounded-full h-8 gap-1.5"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total Revenue",
            value: GHS(totalRevenue),
            icon: TrendingUp,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950/20",
          },
          {
            label: "Total Expenses",
            value: GHS(totalExpenses),
            icon: TrendingDown,
            color: "text-red-600",
            bg: "bg-red-50 dark:bg-red-950/20",
          },
          {
            label: "Net Profit",
            value: GHS(netProfit),
            icon: Banknote,
            color: netProfit >= 0 ? "text-green-700" : "text-red-700",
            bg:
              netProfit >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20",
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className={`border-0 ${bg}`}>
            <CardContent className="pt-5 pb-4 flex items-center gap-4">
              <Icon className={`h-8 w-8 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="ledger">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <TabsList className="rounded-xl">
            <TabsTrigger value="ledger" className="rounded-lg">
              General Ledger
            </TabsTrigger>
            <TabsTrigger value="revenue" className="rounded-lg">
              Revenue
            </TabsTrigger>
            <TabsTrigger value="expenses" className="rounded-lg">
              Expenses
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Export:</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full gap-1 px-2.5"
              disabled={!ledgerRows.length}
              onClick={() => exportCSV("general-ledger", ledgerRows)}
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full gap-1 px-2.5"
              disabled={!ledgerRows.length}
              onClick={() => exportExcel("general-ledger", ledgerRows)}
            >
              <FileSpreadsheet className="h-3 w-3 text-green-600" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full gap-1 px-2.5"
              disabled={!ledgerRows.length}
              onClick={() => exportWord("general-ledger", "General Ledger", ledgerRows)}
            >
              <FileText className="h-3 w-3 text-blue-600" />
              Word
            </Button>
          </div>
        </div>

        <TabsContent value="ledger">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">General Ledger</CardTitle>
              <CardDescription>All revenue and expense transactions combined</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-40 bg-muted animate-pulse rounded-xl" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!ledgerRows.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No transactions found for period
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledgerRows.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge
                              className={`text-[10px] border-0 ${r.Type === "Revenue" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                            >
                              {String(r.Type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{String(r.Ref)}</TableCell>
                          <TableCell className="text-sm">{String(r.Party)}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {String(r.Debit)}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {String(r.Credit)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {String(r.Date)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">
                            {String(r.Notes)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Transactions</CardTitle>
              <CardDescription>
                {completedSales.length} completed sales totaling {GHS(totalRevenue)}
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                  {!completedSales.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No revenue data
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedSales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                        <TableCell className="text-sm">{s.customer_name ?? "Walk-in"}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {GHS(Number(s.total))}
                        </TableCell>
                        <TableCell className="capitalize text-xs">
                          {s.payment_method ?? "cash"}
                        </TableCell>
                        <TableCell className="capitalize text-xs">
                          {s.channel ?? "online"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(s.sale_date)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expense Transactions</CardTitle>
              <CardDescription>
                {expenses.length} purchase orders totaling {GHS(totalExpenses)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!expenses.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No expense data
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.po_number}</TableCell>
                        <TableCell className="text-sm">{e.supplier_name}</TableCell>
                        <TableCell className="text-right font-semibold text-red-700">
                          {GHS(Number(e.total))}
                        </TableCell>
                        <TableCell className="capitalize text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(e.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
