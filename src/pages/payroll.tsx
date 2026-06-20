import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Banknote, Plus, Pencil, Trash2, RefreshCw, Search, Printer, Users, TrendingUp } from "lucide-react";

const GHS = (v: number) => `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Employee { id: number; name: string; department: string | null; }
interface PayrollRun {
  id: number; employeeId: number; employeeName: string | null; department: string | null;
  month: string; basicSalary: string; allowances: string; grossPay: string;
  ssnit: string; tax: string; otherDeductions: string; netPay: string;
  status: string; notes: string | null; createdAt: string;
}
interface PayrollResp { data: PayrollRun[]; total: number; page: number; limit: number; }
interface EmpResp { data: Employee[]; total: number; }

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  paid: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const EMPTY_FORM = { employeeId: "", month: "", basicSalary: "", allowances: "0", ssnit: "0", tax: "0", otherDeductions: "0", notes: "" };

export default function Payroll() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editRun, setEditRun] = useState<PayrollRun | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const params = new URLSearchParams({ limit: "50", page: String(page) });
  if (filterMonth) params.set("month", filterMonth);

  const { data, isLoading, refetch } = useQuery<PayrollResp>({
    queryKey: ["payroll", filterMonth, page],
    queryFn: () => customFetch(`/api/payroll?${params}`),
  });

  const { data: empData } = useQuery<EmpResp>({
    queryKey: ["employees-list"],
    queryFn: () => customFetch("/api/employees?limit=200"),
    enabled: showForm || !!editRun,
  });

  const createRun = useMutation({
    mutationFn: (body: object) => customFetch("/api/payroll", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Payroll run created" }); qc.invalidateQueries({ queryKey: ["payroll"] }); setShowForm(false); setForm(EMPTY_FORM); },
    onError: () => toast({ title: "Failed to create payroll run", variant: "destructive" }),
  });

  const updateRun = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => customFetch(`/api/payroll/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Payroll run updated" }); qc.invalidateQueries({ queryKey: ["payroll"] }); setEditRun(null); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteRun = useMutation({
    mutationFn: (id: number) => customFetch(`/api/payroll/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Payroll run deleted" }); qc.invalidateQueries({ queryKey: ["payroll"] }); setDeleteId(null); },
  });

  const openEdit = (r: PayrollRun) => {
    setEditRun(r);
    setForm({ employeeId: String(r.employeeId), month: r.month, basicSalary: r.basicSalary, allowances: r.allowances, ssnit: r.ssnit, tax: r.tax, otherDeductions: r.otherDeductions, notes: r.notes ?? "" });
  };

  const buildBody = () => ({
    employeeId: Number(form.employeeId), month: form.month,
    basicSalary: Number(form.basicSalary), allowances: Number(form.allowances),
    ssnit: Number(form.ssnit), tax: Number(form.tax), otherDeductions: Number(form.otherDeductions), notes: form.notes,
  });

  const gross = (Number(form.basicSalary) || 0) + (Number(form.allowances) || 0);
  const net = gross - (Number(form.ssnit) || 0) - (Number(form.tax) || 0) - (Number(form.otherDeductions) || 0);

  const rows = data?.data ?? [];
  const filtered = search ? rows.filter(r => r.employeeName?.toLowerCase().includes(search.toLowerCase()) || r.department?.toLowerCase().includes(search.toLowerCase())) : rows;

  const totalNetPay = rows.reduce((s, r) => s + Number(r.netPay), 0);
  const totalGross = rows.reduce((s, r) => s + Number(r.grossPay), 0);
  const paidCount = rows.filter(r => r.status === "paid").length;

  const handlePrint = (r: PayrollRun) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Payslip</title><style>body{font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto}h2{color:#1a1a2e}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 8px;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:500}.total{font-weight:bold;background:#f5f5f5}.net{background:#e8f5e9;font-size:1.1em}</style></head><body><h2>Infinity Sales &amp; Inventory Management</h2><h3>Payslip — ${r.month}</h3><p><strong>Employee:</strong> ${r.employeeName ?? "—"} | <strong>Department:</strong> ${r.department ?? "—"}</p><table><tr><td>Basic Salary</td><td>GHS ${Number(r.basicSalary).toFixed(2)}</td></tr><tr><td>Allowances</td><td>GHS ${Number(r.allowances).toFixed(2)}</td></tr><tr class="total"><td>Gross Pay</td><td>GHS ${Number(r.grossPay).toFixed(2)}</td></tr><tr><td>SSNIT Deduction</td><td>– GHS ${Number(r.ssnit).toFixed(2)}</td></tr><tr><td>Tax (PAYE)</td><td>– GHS ${Number(r.tax).toFixed(2)}</td></tr><tr><td>Other Deductions</td><td>– GHS ${Number(r.otherDeductions).toFixed(2)}</td></tr><tr class="net"><td>Net Pay</td><td>GHS ${Number(r.netPay).toFixed(2)}</td></tr></table>${r.notes ? `<p><em>Notes: ${r.notes}</em></p>` : ""}<p style="margin-top:24px;font-size:0.8em;color:#999">Generated by Infinity Techub Intelligence · ${new Date().toLocaleDateString("en-GH")}</p></body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  const FormContent = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Employee *</label>
          <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>{(empData?.data ?? []).map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name} {e.department ? `(${e.department})` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Month (YYYY-MM) *</label>
          <Input className="h-8 text-xs" type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Basic Salary (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" value={form.basicSalary} onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Allowances (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" value={form.allowances} onChange={e => setForm(f => ({ ...f, allowances: e.target.value }))} />
        </div>
      </div>
      <div className="p-2 rounded-lg bg-muted/40 text-xs flex items-center justify-between">
        <span className="text-muted-foreground">Gross Pay</span>
        <span className="font-bold">{GHS(gross)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">SSNIT (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" value={form.ssnit} onChange={e => setForm(f => ({ ...f, ssnit: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tax/PAYE (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Other Deductions</label>
          <Input className="h-8 text-xs" type="number" min="0" value={form.otherDeductions} onChange={e => setForm(f => ({ ...f, otherDeductions: e.target.value }))} />
        </div>
      </div>
      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
        <span className="font-semibold text-emerald-400">Net Pay</span>
        <span className="font-bold text-emerald-400 text-sm">{GHS(net)}</span>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
        <Input className="h-8 text-xs" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Payroll Management</h1>
            <p className="text-xs text-muted-foreground">Manage employee payroll runs and payslips</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {isAdmin && <Button size="sm" onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }} className="gap-1.5"><Plus className="h-3.5 w-3.5" />New Payroll Run</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Net Pay</p>
            <p className="text-xl font-bold text-emerald-400">{GHS(totalNetPay)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Gross Pay</p>
            <p className="text-xl font-bold text-blue-400">{GHS(totalGross)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5 col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Paid / Total Runs</p>
            <p className="text-xl font-bold">{paidCount} / {rows.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 text-xs pl-8" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Input className="h-8 text-xs w-36" type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }} placeholder="Filter by month" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Employee</TableHead>
              <TableHead className="text-xs">Month</TableHead>
              <TableHead className="text-xs text-right">Gross Pay</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right">Net Pay</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-xs w-28">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No payroll runs found</TableCell></TableRow>}
            {filtered.map(r => {
              const deductions = Number(r.ssnit) + Number(r.tax) + Number(r.otherDeductions);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.employeeName ?? "—"}</div>
                    {r.department && <div className="text-xs text-muted-foreground">{r.department}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{r.month}</TableCell>
                  <TableCell className="text-right text-sm">{GHS(Number(r.grossPay))}</TableCell>
                  <TableCell className="text-right text-sm text-red-400">–{GHS(deductions)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-emerald-400">{GHS(Number(r.netPay))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r)} title="Print Payslip"><Printer className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
          {FormContent()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createRun.mutate(buildBody())} disabled={createRun.isPending || !form.employeeId || !form.month}>
              {createRun.isPending ? "Creating…" : "Create Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRun} onOpenChange={open => !open && setEditRun(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {FormContent()}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
              <Select value={form.employeeId ? (editRun?.status ?? "draft") : "draft"} onValueChange={v => setEditRun(r => r ? { ...r, status: v } : null)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRun(null)}>Cancel</Button>
            <Button onClick={() => editRun && updateRun.mutate({ id: editRun.id, body: { ...buildBody(), status: editRun.status } })} disabled={updateRun.isPending}>
              {updateRun.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete payroll run?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteRun.mutate(deleteId)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
