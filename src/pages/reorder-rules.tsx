// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Zap,
  AlertTriangle,
  CheckCircle2,
  PackageSearch,
} from "lucide-react";
import { fetchAllProductOptions, type ProductOption } from "@/lib/product-options";

/* ── Types ─────────────────────────────── */
interface ReorderRule {
  id: number;
  product_id: number;
  product_name: string;
  sku: string | null;
  category: string | null;
  current_stock: number;
  unit_price: string;
  reorder_point: number;
  reorder_qty: number;
  preferred_supplier_id: number | null;
  preferred_supplier_name: string | null;
  is_active: boolean;
  auto_create_po: boolean;
  last_triggered: string | null;
  needs_reorder: boolean;
}

interface Supplier {
  id: string | number;
  name: string;
}

const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = {
  productId: "",
  reorderPoint: "10",
  reorderQty: "50",
  preferredSupplierId: "",
  isActive: true,
  autoCreatePo: false,
};

export default function ReorderRules() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dlgOpen, setDlgOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReorderRule | null>(null);
  const [delTarget, setDelTarget] = useState<ReorderRule | null>(null);
  const [genConfirm, setGenConfirm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  /* ── Queries ─────────────────────────── */
  const unwrap = <T,>(d: any): T[] => (Array.isArray(d) ? d : (d?.data ?? []));
  const { data: rules = [], isLoading } = useQuery<ReorderRule[]>({
    queryKey: ["reorder-rules"],
    queryFn: () => customFetch<any>("/api/reorder-rules").then((d) => unwrap<ReorderRule>(d)),
    refetchInterval: 60_000,
  });

  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products", "all-options"],
    queryFn: fetchAllProductOptions,
    staleTime: 120_000,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers-mini"],
    queryFn: () => customFetch<any>("/api/suppliers").then((d) => unwrap<Supplier>(d)),
    staleTime: 120_000,
  });

  /* ── Mutations ───────────────────────── */
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        productId: form.productId,
        reorderPoint: Number(form.reorderPoint),
        reorderQty: Number(form.reorderQty),
        preferredSupplierId: form.preferredSupplierId || null,
        isActive: form.isActive,
        autoCreatePo: form.autoCreatePo,
      };
      return editTarget
        ? customFetch(`/api/reorder-rules/${editTarget.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : customFetch("/api/reorder-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Rule updated" : "Reorder rule created" });
      qc.invalidateQueries({ queryKey: ["reorder-rules"] });
      setDlgOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/reorder-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Rule deleted" });
      qc.invalidateQueries({ queryKey: ["reorder-rules"] });
      setDelTarget(null);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/reorder-rules/generate-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: (r: { created: number; message: string }) => {
      toast({ title: "Purchase orders generated", description: r.message });
      qc.invalidateQueries({ queryKey: ["reorder-rules"] });
      setGenConfirm(false);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const needsReorder = rules.filter((r) => r.needs_reorder && r.is_active);
  const active = rules.filter((r) => r.is_active);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Reorder Rules</h2>
          <p className="text-xs text-muted-foreground">
            Automatic reorder triggers and purchase order generation
          </p>
        </div>
        <div className="flex gap-2">
          {needsReorder.length > 0 && (
            <Button
              variant="outline"
              className="gap-1.5 text-amber-400 border-amber-500/30 hover:text-amber-300"
              onClick={() => setGenConfirm(true)}
            >
              <Zap className="h-4 w-4" />
              Generate POs ({needsReorder.length})
            </Button>
          )}
          <Button
            className="gap-1.5"
            onClick={() => {
              setEditTarget(null);
              setForm(emptyForm);
              setDlgOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card
          className={
            needsReorder.length > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-border"
          }
        >
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground">Need Reordering</p>
            <p
              className={`text-xl font-bold ${needsReorder.length > 0 ? "text-amber-400" : "text-muted-foreground"}`}
            >
              {needsReorder.length}
            </p>
            <p className="text-[10px] text-muted-foreground">products below threshold</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground">Active Rules</p>
            <p className="text-xl font-bold">{active.length}</p>
            <p className="text-[10px] text-muted-foreground">of {rules.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground">Auto-PO Enabled</p>
            <p className="text-xl font-bold">{rules.filter((r) => r.auto_create_po).length}</p>
            <p className="text-[10px] text-muted-foreground">rules</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="pl-4">Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Reorder At</TableHead>
              <TableHead className="text-right">Order Qty</TableHead>
              <TableHead>Preferred Supplier</TableHead>
              <TableHead>Auto-PO</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                  No reorder rules yet — add one to automate purchasing
                </TableCell>
              </TableRow>
            )}
            {rules.map((r) => (
              <TableRow
                key={r.id}
                className={`text-xs group ${r.needs_reorder && r.is_active ? "bg-amber-500/5" : ""}`}
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2">
                    {r.needs_reorder && r.is_active ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/50 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{r.product_name}</p>
                      {r.sku && (
                        <p className="text-[10px] text-muted-foreground font-mono">{r.sku}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                <TableCell
                  className={`text-right font-mono font-semibold ${r.needs_reorder ? "text-amber-400" : "text-foreground"}`}
                >
                  {r.current_stock}
                </TableCell>
                <TableCell className="text-right font-mono">{r.reorder_point}</TableCell>
                <TableCell className="text-right font-mono">{r.reorder_qty}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.preferred_supplier_name ?? "Any"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${r.auto_create_po ? "text-primary border-primary/30" : "text-muted-foreground"}`}
                  >
                    {r.auto_create_po ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${r.is_active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditTarget(r);
                        setForm({
                          productId: String(r.product_id),
                          reorderPoint: String(r.reorder_point),
                          reorderQty: String(r.reorder_qty),
                          preferredSupplierId: r.preferred_supplier_id
                            ? String(r.preferred_supplier_id)
                            : "",
                          isActive: r.is_active,
                          autoCreatePo: r.auto_create_po,
                        });
                        setDlgOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-400 hover:text-red-300"
                      onClick={() => setDelTarget(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Rule Dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Reorder Rule" : "Add Reorder Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!editTarget && (
              <div className="space-y-1.5">
                <Label className="text-xs">Product *</Label>
                <select
                  value={form.productId}
                  onChange={(e) => {
                    const prod = products.find((p) => String(p.id) === e.target.value);
                    setForm((f) => ({
                      ...f,
                      productId: e.target.value,
                      reorderPoint: prod ? String(prod.reorder_point) : f.reorderPoint,
                    }));
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {editTarget && (
              <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                Product:{" "}
                <span className="font-semibold text-foreground">{editTarget.product_name}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Reorder At (units)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.reorderPoint}
                  onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">When stock falls to this level</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Order Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.reorderQty}
                  onChange={(e) => setForm((f) => ({ ...f, reorderQty: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">Units to include in PO</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preferred Supplier</Label>
              <select
                value={form.preferredSupplierId}
                onChange={(e) => setForm((f) => ({ ...f, preferredSupplierId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Any supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="isActive" className="text-xs cursor-pointer">
                  Active
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="autoPo"
                  checked={form.autoCreatePo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, autoCreatePo: v }))}
                />
                <Label htmlFor="autoPo" className="text-xs cursor-pointer">
                  Auto-generate PO
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDlgOpen(false);
                setEditTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={(!editTarget && !form.productId) || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editTarget ? "Update" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate PO Confirm */}
      <AlertDialog open={genConfirm} onOpenChange={setGenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Purchase Orders</AlertDialogTitle>
            <AlertDialogDescription>
              This will create draft purchase orders for <strong>{needsReorder.length}</strong>{" "}
              product(s) that are below their reorder point. Orders will be grouped by supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating…" : "Generate POs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!delTarget} onOpenChange={(open) => !open && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reorder Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Delete rule for <strong>{delTarget?.product_name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delTarget && delMutation.mutate(delTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
