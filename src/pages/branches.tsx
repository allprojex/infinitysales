// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Pencil, Trash2, RefreshCw, Star, MapPin,
  Phone, Mail, Users, Package, TrendingUp, Banknote,
  ShoppingCart, BarChart3, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { GhanaRegionPicker } from "@/components/ghana-region-picker";

/* ── Types ──────────────────────────────────────────────── */
interface Branch {
  id: number; name: string; code: string;
  address: string | null; city: string | null;
  phone: string | null; email: string | null;
  manager_id: number | null; manager_name: string | null; manager_email: string | null;
  is_active: boolean; is_default: boolean; notes: string | null;
  created_at: string; updated_at: string;
  products_in_stock: number; total_customers: number;
}

interface BranchDetail {
  branch: Branch;
  performance: {
    revenue_30d: string; sales_30d: number; avg_sale_30d: string;
    pending_sales: number; cash_sales: number; momo_sales: number; card_sales: number;
  };
  inventory: {
    total_products: number; total_units: number; inventory_value: string;
    out_of_stock: number; low_stock: number;
  };
  topProducts: { id: number; name: string; category: string | null; units_sold: number; revenue: string }[];
  recentSales: { id: number; invoice_number: string; customer_name: string | null; total: string; status: string; payment_method: string | null; sale_date: string }[];
}

/* ── Helpers ─────────────────────────────────────────────── */
const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });

const emptyForm = { name: "", code: "", address: "", city: "", phone: "", email: "", managerId: "", isActive: true, isDefault: false, notes: "" };

const statusColor = (s: string) => {
  if (s === "completed") return "text-emerald-400";
  if (s === "pending")   return "text-amber-400";
  return "text-muted-foreground";
};

/* ── Component ──────────────────────────────────────────── */
export default function Branches() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selected,   setSelected]   = useState<number | null>(null);
  const [dlgOpen,    setDlgOpen]    = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [delTarget,  setDelTarget]  = useState<Branch | null>(null);
  const [form,       setForm]       = useState(emptyForm);

  /* ── Queries ─────────────────────────────────────── */
  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => customFetch("/api/branches"),
    refetchInterval: 60_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<BranchDetail>({
    queryKey: ["branch-detail", selected],
    queryFn: () => customFetch(`/api/branches/${selected}`),
    enabled: !!selected,
    refetchInterval: 60_000,
  });

  /* ── Mutations ───────────────────────────────────── */
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, code: form.code, address: form.address || null,
        city: form.city || null, phone: form.phone || null, email: form.email || null,
        managerId: form.managerId ? Number(form.managerId) : null,
        isActive: form.isActive, isDefault: form.isDefault, notes: form.notes || null,
      };
      return editTarget
        ? customFetch(`/api/branches/${editTarget.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : customFetch("/api/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: (b: Branch) => {
      toast({ title: editTarget ? "Branch updated" : "Branch created" });
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branch-detail"] });
      setDlgOpen(false);
      setSelected(b.id);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/branches/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Branch deleted" });
      qc.invalidateQueries({ queryKey: ["branches"] });
      if (delTarget?.id === selected) setSelected(null);
      setDelTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Helpers ─────────────────────────────────────── */
  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setDlgOpen(true); };
  const openEdit   = (b: Branch) => {
    setEditTarget(b);
    setForm({ name: b.name, code: b.code, address: b.address ?? "", city: b.city ?? "", phone: b.phone ?? "", email: b.email ?? "", managerId: b.manager_id ? String(b.manager_id) : "", isActive: b.is_active, isDefault: b.is_default, notes: b.notes ?? "" });
    setDlgOpen(true);
  };

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: branch list ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-sidebar">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Branches</span>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={openCreate}>
            <Plus className="h-3 w-3" />New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && branches.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No branches yet</div>
          )}
          {branches.map(b => (
            <button key={b.id} onClick={() => setSelected(b.id)}
              className={`w-full text-left rounded-lg p-2.5 transition-colors border ${b.id === selected ? "bg-primary/15 border-primary/30" : "hover:bg-muted/50 border-transparent"}`}>
              <div className="flex items-start gap-2">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${b.is_active ? "bg-emerald-500/20" : "bg-muted"}`}>
                  <Building2 className={`h-4 w-4 ${b.is_active ? "text-emerald-400" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold truncate">{b.name}</p>
                    {b.is_default && <Star className="h-2.5 w-2.5 text-amber-400 shrink-0" fill="currentColor" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">{b.code}</p>
                  {b.city && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{b.city}</p>}
                  <Badge variant="outline" className={`mt-1 text-[9px] py-0 ${b.is_active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                    {b.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: branch detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <Building2 className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Select a branch or create a new one</p>
            <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />New Branch</Button>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="border-b px-5 py-3 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">{detail.branch.name}</h2>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{detail.branch.code}</span>
                  {detail.branch.is_default && <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">Default</Badge>}
                  <Badge variant="outline" className={`text-[10px] ${detail.branch.is_active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                    {detail.branch.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                  {detail.branch.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{detail.branch.city}</span>}
                  {detail.branch.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{detail.branch.phone}</span>}
                  {detail.branch.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{detail.branch.email}</span>}
                  {detail.branch.manager_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{detail.branch.manager_name}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(detail.branch)}>
                  <Pencil className="h-3.5 w-3.5" />Edit
                </Button>
                {!detail.branch.is_default && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-400 hover:text-red-300" onClick={() => setDelTarget(detail.branch)}>
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-5">

              {/* Performance KPI cards — 30 day window */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">Performance — Last 30 Days</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-3 pb-2">
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                      <p className="text-lg font-bold text-primary">{ghc(detail.performance.revenue_30d)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <p className="text-[10px] text-muted-foreground">Sales</p>
                      <p className="text-lg font-bold">{detail.performance.sales_30d}</p>
                      <p className="text-[10px] text-amber-400">{detail.performance.pending_sales} pending</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <p className="text-[10px] text-muted-foreground">Avg Sale Value</p>
                      <p className="text-lg font-bold">{ghc(detail.performance.avg_sale_30d)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <p className="text-[10px] text-muted-foreground">Payment Mix</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-emerald-400">Cash {detail.performance.cash_sales}</span>
                        <span className="text-[10px] text-blue-400">MoMo {detail.performance.momo_sales}</span>
                        <span className="text-[10px] text-violet-400">Card {detail.performance.card_sales}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Inventory snapshot */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">Inventory Snapshot</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "Products", value: detail.inventory.total_products, color: "" },
                    { label: "Total Units", value: detail.inventory.total_units?.toLocaleString(), color: "" },
                    { label: "Stock Value", value: ghc(detail.inventory.inventory_value), color: "text-primary" },
                    { label: "Low Stock", value: detail.inventory.low_stock, color: "text-amber-400" },
                    { label: "Out of Stock", value: detail.inventory.out_of_stock, color: "text-red-400" },
                  ].map(k => (
                    <Card key={k.label}>
                      <CardContent className="pt-3 pb-2">
                        <p className="text-[10px] text-muted-foreground">{k.label}</p>
                        <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Two-column: top products + recent sales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Top products */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Top Products (30 days)</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="pl-3">Product</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="text-right pr-3">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.topProducts.length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-xs">No sales data</TableCell></TableRow>
                        )}
                        {detail.topProducts.map((p, i) => (
                          <TableRow key={p.id} className="text-xs">
                            <TableCell className="pl-3">
                              <span className="text-muted-foreground mr-1.5">#{i+1}</span>{p.name}
                            </TableCell>
                            <TableCell className="text-right">{p.units_sold}</TableCell>
                            <TableCell className="text-right pr-3 font-mono">{ghc(p.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Recent sales */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Recent Transactions</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="pl-3">Invoice</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right pr-3">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.recentSales.length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-xs">No sales yet</TableCell></TableRow>
                        )}
                        {detail.recentSales.map(s => (
                          <TableRow key={s.id} className="text-xs">
                            <TableCell className="pl-3">
                              <span className={`font-mono ${statusColor(s.status)}`}>{s.invoice_number}</span>
                              <p className="text-[10px] text-muted-foreground">{fmtDate(s.sale_date)}</p>
                            </TableCell>
                            <TableCell className="text-muted-foreground truncate max-w-[80px]">{s.customer_name ?? "Walk-in"}</TableCell>
                            <TableCell className="text-right pr-3 font-mono">{ghc(s.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {detail.branch.notes && (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Notes</p>
                  {detail.branch.notes}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? "Edit Branch" : "New Branch"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Branch Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Branch" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Branch Code *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="HQ" maxLength={10} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">City / Region</Label>
              <GhanaRegionPicker value={form.city} onChange={v => setForm(f => ({ ...f, city: v ?? "" }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+233 XX XXX XXXX" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="branch@store.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Manager User ID</Label>
              <Input type="number" value={form.managerId} onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))} placeholder="User ID (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
            <div className="flex gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch id="isActive" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                <Label htmlFor="isActive" className="text-xs cursor-pointer">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="isDefault" checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
                <Label htmlFor="isDefault" className="text-xs cursor-pointer">Set as Default</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editTarget ? "Update" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!delTarget} onOpenChange={open => !open && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{delTarget?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => delTarget && deleteMutation.mutate(delTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}