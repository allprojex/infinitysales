import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Pencil, Trash2, RefreshCw, CheckCircle2, AlertTriangle, Clock, Banknote, Receipt, CreditCard } from "lucide-react";

/* ── Types ─────────────────────────────── */
interface Invoice {
  id: number; purchase_order_id: number | null; invoice_number: string;
  supplier_name: string; supplier_id: number | null; supplier_display_name: string | null;
  issue_date: string; due_date: string;
  subtotal: string; tax_amount: string; total: string;
  status: string; amount_paid: string;
  payment_date: string | null; payment_method: string | null; payment_reference: string | null;
  notes: string | null; po_number: string | null; created_by_name: string | null;
  created_at: string;
}
interface Summary {
  total: number; unpaid: number; partial: number; paid: number;
  overdue: number; disputed: number; outstanding_balance: string; paid_total: string;
  newly_overdue: number;
}

const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });

const STATUS_COLORS: Record<string, string> = {
  unpaid:   "text-amber-400 border-amber-500/30",
  partial:  "text-blue-400 border-blue-500/30",
  paid:     "text-emerald-400 border-emerald-500/30",
  overdue:  "text-red-400 border-red-500/30",
  disputed: "text-orange-400 border-orange-500/30",
};

const PAYMENT_METHODS = ["cash", "bank_transfer", "mobile_money", "cheque", "card"];

const emptyForm = {
  invoiceNumber: "", supplierName: "", issueDate: new Date().toISOString().split("T")[0],
  dueDate: "", subtotal: "", taxAmount: "0", total: "", notes: "", purchaseOrderId: "",
};
const emptyPayForm = { amountPaid: "", paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "bank_transfer", paymentReference: "" };

export default function SupplierInvoices() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterTab,  setFilterTab]  = useState("all");
  const [createDlg,  setCreateDlg]  = useState(false);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);
  const [payTarget,  setPayTarget]  = useState<Invoice | null>(null);
  const [delTarget,  setDelTarget]  = useState<Invoice | null>(null);
  const [form,       setForm]       = useState(emptyForm);
  const [payForm,    setPayForm]    = useState(emptyPayForm);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  /* ── Queries ─────────────────────────── */
  const { data: invoicesResp, isLoading } = useQuery<Invoice[] | { data: Invoice[] }>({
    queryKey: ["supplier-invoices", filterTab],
    queryFn: () => customFetch(`/api/supplier-invoices${filterTab !== "all" ? `?status=${filterTab}` : ""}`),
    refetchInterval: 60_000,
  });
  const invoices: Invoice[] = Array.isArray(invoicesResp) ? invoicesResp : (invoicesResp?.data ?? []);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["supplier-invoices-summary"],
    queryFn: () => customFetch("/api/supplier-invoices/summary"),
    refetchInterval: 60_000,
  });
  const { data: suppliersResp } = useQuery<{ data: Array<{ id: number; name: string }> }>({
    queryKey: ["suppliers", "invoice-picker", form.supplierName],
    queryFn: () => customFetch(`/api/suppliers?limit=50${form.supplierName ? `&search=${encodeURIComponent(form.supplierName)}` : ""}`),
    enabled: createDlg || !!editTarget,
  });

  /* ── Mutations ───────────────────────── */
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { ...form, subtotal: Number(form.subtotal), taxAmount: Number(form.taxAmount), total: Number(form.total), purchaseOrderId: form.purchaseOrderId ? Number(form.purchaseOrderId) : null };
      return editTarget
        ? customFetch(`/api/supplier-invoices/${editTarget.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : customFetch("/api/supplier-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Invoice updated" : "Invoice created" });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices-summary"] });
      setCreateDlg(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/supplier-invoices/${payTarget!.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaid: Number(payForm.amountPaid), paymentDate: payForm.paymentDate, paymentMethod: payForm.paymentMethod, paymentReference: payForm.paymentReference }),
      }),
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices-summary"] });
      setPayTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/supplier-invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Invoice deleted" });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices-summary"] });
      setDelTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Render ──────────────────────────── */
  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Supplier Invoices</h2>
          <p className="text-xs text-muted-foreground">Track and manage incoming supplier invoices and payments</p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditTarget(null); setForm(emptyForm); setCreateDlg(true); }}>
          <Plus className="h-4 w-4" />Add Invoice
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="pt-3 pb-2">
              <p className="text-[10px] text-muted-foreground">Outstanding</p>
              <p className="text-xl font-bold text-amber-400">{ghc(summary.outstanding_balance)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.unpaid + summary.partial} invoices unpaid</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-3 pb-2">
              <p className="text-[10px] text-muted-foreground">Paid (all time)</p>
              <p className="text-xl font-bold text-emerald-400">{ghc(summary.paid_total)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.paid} invoices</p>
            </CardContent>
          </Card>
          <Card className={summary.overdue > 0 ? "border-red-500/20 bg-red-500/5" : "border-border"}>
            <CardContent className="pt-3 pb-2">
              <p className="text-[10px] text-muted-foreground">Overdue</p>
              <p className={`text-xl font-bold ${summary.overdue > 0 ? "text-red-400" : "text-muted-foreground"}`}>{summary.overdue}</p>
              <p className="text-[10px] text-muted-foreground">invoices past due</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <p className="text-[10px] text-muted-foreground">Total Invoices</p>
              <p className="text-xl font-bold">{summary.total}</p>
              <p className="text-[10px] text-muted-foreground">{summary.disputed} disputed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter tabs */}
      <Tabs value={filterTab} onValueChange={setFilterTab}>
        <TabsList className="h-8">
          {["all","unpaid","partial","overdue","paid","disputed"].map(s => (
            <TabsTrigger key={s} value={s} className="text-xs h-7 capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="pl-4">Invoice #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-10">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            )}
            {!isLoading && invoices.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                No invoices {filterTab !== "all" ? `with status "${filterTab}"` : "yet"}
              </TableCell></TableRow>
            )}
            {invoices.map(inv => {
              const balance = Number(inv.total) - Number(inv.amount_paid);
              const isOverdue = inv.status !== "paid" && new Date(inv.due_date) < new Date();
              return (
                <TableRow key={inv.id} className="text-xs group">
                  <TableCell className="pl-4 font-mono font-semibold">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.supplier_name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono">{inv.po_number ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(inv.issue_date)}</TableCell>
                  <TableCell className={isOverdue && inv.status !== "paid" ? "text-red-400 font-medium" : "text-muted-foreground"}>
                    {fmtDate(inv.due_date)}
                    {isOverdue && inv.status !== "paid" && <span className="ml-1 text-[9px]">OVERDUE</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{ghc(inv.total)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${balance > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {balance > 0 ? ghc(balance) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] py-0 capitalize ${STATUS_COLORS[inv.status] ?? ""}`}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {inv.status !== "paid" && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-400 hover:text-emerald-300"
                          onClick={() => { setPayTarget(inv); setPayForm({ ...emptyPayForm, amountPaid: String(Number(inv.total) - Number(inv.amount_paid)) }); }}
                          title="Record payment">
                          <CreditCard className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => { setEditTarget(inv); setForm({ invoiceNumber: inv.invoice_number, supplierName: inv.supplier_name, issueDate: inv.issue_date, dueDate: inv.due_date, subtotal: inv.subtotal, taxAmount: inv.tax_amount, total: inv.total, notes: inv.notes ?? "", purchaseOrderId: inv.purchase_order_id ? String(inv.purchase_order_id) : "" }); setCreateDlg(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-300"
                        onClick={() => setDelTarget(inv)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={createDlg || !!editTarget} onOpenChange={open => { if (!open) { setCreateDlg(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? "Edit Invoice" : "Add Supplier Invoice"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Invoice Number *</Label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-001" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">PO Number (optional)</Label>
                <Input type="number" value={form.purchaseOrderId} onChange={e => setForm(f => ({ ...f, purchaseOrderId: e.target.value }))} placeholder="PO ID" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier Name *</Label>
              <div className="relative">
                <Input value={form.supplierName}
                  onFocus={() => setSupplierPickerOpen(true)}
                  onChange={e => { setForm(f => ({ ...f, supplierName: e.target.value })); setSupplierPickerOpen(true); }}
                  placeholder="Search suppliers…" autoComplete="off" />
                {supplierPickerOpen && suppliersResp && (
                  <div className="absolute z-50 left-0 right-0 mt-1 border rounded-xl overflow-hidden bg-card shadow-md max-h-44 overflow-y-auto">
                    {suppliersResp.data.length ? [...suppliersResp.data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map(s => (
                      <button type="button" key={s.id} className="w-full px-3 py-2 hover:bg-muted text-sm text-left"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setForm(f => ({ ...f, supplierName: s.name })); setSupplierPickerOpen(false); }}>
                        {s.name}
                      </button>
                    )) : <p className="px-3 py-2 text-xs text-muted-foreground">No matching suppliers</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Issue Date *</Label>
                <Input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date *</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Subtotal (₵)</Label>
                <Input type="number" min="0" step="0.01" value={form.subtotal}
                  onChange={e => { const st = e.target.value; const tax = Number(form.taxAmount); setForm(f => ({ ...f, subtotal: st, total: String(Number(st) + tax) })); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax (₵)</Label>
                <Input type="number" min="0" step="0.01" value={form.taxAmount}
                  onChange={e => { const tax = e.target.value; setForm(f => ({ ...f, taxAmount: tax, total: String(Number(f.subtotal) + Number(tax)) })); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Total (₵)</Label>
                <Input type="number" min="0" step="0.01" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDlg(false); setEditTarget(null); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()}
              disabled={!form.invoiceNumber || !form.supplierName || !form.issueDate || !form.dueDate || !form.total || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editTarget ? "Update" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payTarget} onOpenChange={open => !open && setPayTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {payTarget && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono font-semibold">{payTarget.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span>{payTarget.supplier_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-mono">{ghc(payTarget.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span className="font-mono font-bold text-amber-400">{ghc(Number(payTarget.total) - Number(payTarget.amount_paid))}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount Paid (₵) *</Label>
                <Input type="number" min="0.01" step="0.01" value={payForm.amountPaid} onChange={e => setPayForm(f => ({ ...f, amountPaid: e.target.value }))} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Date</Label>
                <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reference / Cheque #</Label>
                <Input value={payForm.paymentReference} onChange={e => setPayForm(f => ({ ...f, paymentReference: e.target.value }))} placeholder="Transfer ref…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={() => payMutation.mutate()} disabled={!payForm.amountPaid || Number(payForm.amountPaid) <= 0 || payMutation.isPending}>
              {payMutation.isPending ? "Recording…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!delTarget} onOpenChange={open => !open && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>Delete invoice <strong>{delTarget?.invoice_number}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => delTarget && delMutation.mutate(delTarget.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
