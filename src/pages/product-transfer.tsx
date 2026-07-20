import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRightLeft,
  Plus,
  MoreVertical,
  Trash2,
  Loader2,
  ArrowRight,
  Search,
  X,
  CheckCircle2,
  XCircle,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fetchAllProductOptions } from "@/lib/product-options";

type TransferItem = {
  productName?: string;
  product_name?: string;
  name?: string;
  sku?: string | null;
  quantity: number;
};
type Transfer = {
  id: string;
  transferNumber: string;
  productId: string | number | null;
  productName: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  quantity: number;
  status: string;
  reason: string | null;
  notes?: string | null;
  items?: TransferItem[];
  createdAt: string;
};
type Warehouse = { id: number; name: string; location: string | null; isDefault: boolean };

function useWarehouses() {
  return useQuery<Warehouse[]>({
    // Keep transfer options separate from the warehouse-management cache. A
    // previously failed/empty management request must not leave this picker
    // empty for the rest of the signed-in session.
    queryKey: ["warehouses", "transfer-options"],
    queryFn: () => customFetch("/api/warehouses"),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

// The account's central/receiving/distribution warehouse (warehouses.is_default)
// IS "General Stock" — there is no separate unassigned-stock location anymore.
// Every transfer picks a real warehouse on both sides.
const warehouseSelectLabel = (w: Warehouse) =>
  w.isDefault ? `${w.name} (General Stock / Central Warehouse)` : w.name;

type WarehouseStockRow = { product: { id: number | string }; stock: number };

// Warehouse-scoped balances for the selected source warehouse (same endpoint
// warehouses.tsx uses). The server derives the central warehouse's balance
// as products.stock minus every other warehouse's ledger balance, so this
// works uniformly for the central warehouse and every branch.
function useWarehouseStock(warehouseId: string) {
  return useQuery<WarehouseStockRow[]>({
    queryKey: ["warehouse-stock", warehouseId],
    queryFn: () => customFetch(`/api/warehouses/${warehouseId}/stock`),
    enabled: !!warehouseId,
  });
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function ProductTransfer() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});
  const [productSearch, setProductSearch] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const {
    data: whData,
    isLoading: warehousesLoading,
    isError: warehousesFailed,
    refetch: refetchWarehouses,
  } = useWarehouses();
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", "all-options"],
    queryFn: fetchAllProductOptions,
    staleTime: 120_000,
  });
  const { data: categoryResponse } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["product-categories", "transfer-filter"],
    queryFn: () => customFetch("/api/product-categories"),
  });
  const filteredProducts =
    categoryFilter === "all"
      ? products
      : products.filter((product) => product.categoryId === categoryFilter);
  const visibleProducts = filteredProducts.filter((product) => {
    const needle = productSearch.trim().toLocaleLowerCase();
    return (
      !needle ||
      product.name.toLocaleLowerCase().includes(needle) ||
      String(product.sku ?? "")
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
  const warehouses = [...(whData ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  // Default the source to the central warehouse ("General Stock") once
  // warehouses load, since it's no longer a separate sentinel option.
  useEffect(() => {
    if (fromWh || !warehouses.length) return;
    const central = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    setFromWh(String(central.id));
  }, [warehouses, fromWh]);

  const { data: sourceStock, isLoading: sourceStockLoading } = useWarehouseStock(fromWh);
  const sourceStockById = new Map(
    (sourceStock ?? []).map((row) => [String(row.product.id), row.stock]),
  );
  // Available quantity to transfer FROM the currently selected source. The
  // server already derives the correct balance for whichever warehouse is
  // selected (central or branch), so this is uniform now.
  const availableStock = (productId: string) => sourceStockById.get(productId) ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["product-transfers"] });

  const { data, isLoading } = useQuery<{ data: Transfer[]; total: number }>({
    queryKey: ["product-transfers"],
    queryFn: () => customFetch("/api/product-transfers?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (d: object) =>
      customFetch("/api/product-transfers", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Transfer recorded" });
      setCreating(false);
      setSelectedProducts({});
      setProductSearch("");
      setFromWh("");
      setToWh("");
      setReason("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "cancelled" }) =>
      customFetch(`/api/product-transfers/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, { status }) => {
      toast({ title: status === "completed" ? "Transfer marked completed" : "Transfer cancelled" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Failed to update transfer", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => customFetch(`/api/product-transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Transfer removed" });
      setDeletingId(null);
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Failed to remove transfer", description: e.message }),
  });

  const transfers = data?.data ?? [];

  // Mirrors sales.tsx's printReceipt() — a self-contained HTML document
  // opened in a new tab and auto-printed, same look-and-feel as the rest of
  // the app's printable records.
  const printTransfer = (t: Transfer) => {
    const items = Array.isArray(t.items) ? t.items : [];
    const date = new Date(t.createdAt).toLocaleDateString("en-GH", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const itemRows = items
      .map(
        (i) =>
          `<tr>
        <td style="padding:4px 6px;font-size:12px">${i.productName ?? i.product_name ?? i.name ?? "Item"}</td>
        <td style="padding:4px 6px;font-size:12px">${i.sku ?? "—"}</td>
        <td style="padding:4px 6px;text-align:right;font-size:12px">${i.quantity}</td>
      </tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transfer — ${t.transferNumber}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Courier New',monospace;font-size:13px;background:#fff;color:#111;padding:20px;max-width:420px;margin:0 auto}
      .header{text-align:center;margin-bottom:12px;border-bottom:2px dashed #333;padding-bottom:12px}
      .header h1{font-size:18px;font-weight:bold;letter-spacing:1px}
      .header p{font-size:11px;color:#555;margin-top:3px}
      .meta{margin:10px 0;font-size:11px;display:flex;flex-direction:column;gap:3px}
      .meta-row{display:flex;justify-content:space-between}
      .route{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:bold;margin:12px 0;text-align:center}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      thead tr{border-bottom:1px solid #333}
      th{font-size:11px;padding:4px 6px;text-align:left;font-weight:bold}
      th:last-child,td:last-child{text-align:right}
      .divider{border:none;border-top:1px dashed #aaa;margin:8px 0}
      .footer{text-align:center;margin-top:14px;border-top:2px dashed #333;padding-top:12px;font-size:11px;color:#555}
      @media print{body{padding:0}button{display:none}}
    </style></head><body>
    <div class="header">
      <h1>INFINITY SALES &amp; INVENTORY</h1>
      <p>Product Transfer Record</p>
    </div>
    <div class="meta">
      <div class="meta-row"><span>Transfer #:</span><strong>${t.transferNumber}</strong></div>
      <div class="meta-row"><span>Date:</span><span>${date}</span></div>
      <div class="meta-row"><span>Status:</span><span style="text-transform:capitalize">${t.status}</span></div>
      <div class="meta-row"><span>Reason:</span><span>${t.reason ?? "—"}</span></div>
    </div>
    <div class="route">${t.fromWarehouseName} &rarr; ${t.toWarehouseName}</div>
    <hr class="divider"/>
    <table>
      <thead><tr><th>Item</th><th>SKU</th><th>Qty</th></tr></thead>
      <tbody>${itemRows || `<tr><td colspan="3" style="text-align:center;padding:8px;font-size:11px;color:#888">No line items recorded</td></tr>`}</tbody>
    </table>
    <hr class="divider"/>
    <div class="footer">
      <p>${t.notes ? t.notes : "Internal stock transfer record"}</p>
      <p style="margin-top:4px">Powered by Infinity Techub Intelligence</p>
    </div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=420,height=700,scrollbars=yes");
    if (!w) {
      toast({
        title: "Pop-up blocked",
        description: "Allow pop-ups to print transfer records",
        variant: "destructive",
      });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(selectedProducts).map(([productId, quantity]) => ({
      productId,
      productName: products.find((product) => String(product.id) === productId)?.name,
      quantity: Number(quantity),
    }));
    if (!toWh || !items.length || items.some((item) => item.quantity < 1)) return;
    if (fromWh === toWh) return;
    createMut.mutate({
      items,
      fromWarehouseId: fromWh,
      toWarehouseId: toWh,
      reason: reason || null,
      notes: notes || null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Product Transfers</h2>
          <p className="text-muted-foreground">
            Move stock between warehouses and storage locations.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="h-4 w-4" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Product Transfer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium">Products *</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="rounded-[20px] mt-1 mb-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryResponse?.data.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products by name or SKU"
                    className="rounded-[20px] pl-9"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border p-2 space-y-1">
                  {!visibleProducts.length ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No products found
                    </p>
                  ) : (
                    visibleProducts.map((product) => {
                      const id = String(product.id);
                      const checked = id in selectedProducts;
                      const stock = availableStock(id);
                      const sourceLabel =
                        warehouses.find((w) => String(w.id) === fromWh)?.name ?? "Source";
                      return (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/60 ${stock < 1 ? "opacity-50" : ""}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={stock < 1}
                            onCheckedChange={(value) =>
                              setSelectedProducts((current) => {
                                const next = { ...current };
                                if (value) next[id] = "1";
                                else delete next[id];
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {product.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {product.category ?? "Other"} · {sourceLabel}:{" "}
                              {sourceStockLoading ? "…" : stock}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {!!Object.keys(selectedProducts).length && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium">
                      {Object.keys(selectedProducts).length} product(s) selected
                    </p>
                    {Object.entries(selectedProducts).map(([id, quantity]) => {
                      const product = products.find((candidate) => String(candidate.id) === id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 rounded-lg bg-muted/40 p-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {product?.name}
                          </span>
                          <Input
                            type="number"
                            min="1"
                            max={availableStock(id)}
                            value={quantity}
                            onChange={(e) =>
                              setSelectedProducts((current) => ({
                                ...current,
                                [id]: e.target.value,
                              }))
                            }
                            aria-label={`Quantity for ${product?.name}`}
                            className="h-8 w-24 rounded-full"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setSelectedProducts((current) => {
                                const next = { ...current };
                                delete next[id];
                                return next;
                              })
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">From</label>
                  <Select value={fromWh} onValueChange={setFromWh} disabled={warehousesLoading}>
                    <SelectTrigger className="rounded-[20px] mt-1">
                      <SelectValue placeholder={warehousesLoading ? "Loading..." : undefined} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {warehouseSelectLabel(w)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">To Warehouse *</label>
                  <Select
                    value={toWh}
                    onValueChange={setToWh}
                    disabled={warehousesLoading || warehousesFailed || !warehouses.length}
                  >
                    <SelectTrigger className="rounded-[20px] mt-1">
                      <SelectValue
                        placeholder={
                          warehousesLoading ? "Loading warehouses..." : "Select warehouse"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {warehouseSelectLabel(w)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {warehousesFailed && (
                    <button
                      type="button"
                      className="mt-1 text-left text-xs text-destructive underline"
                      onClick={() => void refetchWarehouses()}
                    >
                      Warehouses could not be loaded. Retry
                    </button>
                  )}
                  {!warehousesLoading && !warehousesFailed && !warehouses.length && (
                    <p className="mt-1 text-xs text-amber-700">
                      No destination warehouse exists. Create one under Warehouses first.
                    </p>
                  )}
                </div>
              </div>
              {!!toWh && fromWh === toWh && (
                <p className="text-xs text-destructive -mt-2">
                  Source and destination warehouses must be different.
                </p>
              )}
              <div>
                <label className="text-xs font-medium">Reason</label>
                <Input
                  id="transfer-reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for transfer"
                  className="rounded-[20px] mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <Textarea
                  id="transfer-notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-[20px] mt-1"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={
                    createMut.isPending ||
                    !toWh ||
                    fromWh === toWh ||
                    !Object.keys(selectedProducts).length ||
                    Object.entries(selectedProducts).some(([id, quantity]) => {
                      return Number(quantity) < 1 || Number(quantity) > availableStock(id);
                    })
                  }
                >
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record
                  Transfer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRightLeft className="h-4 w-4" />
            <span>{data?.total ?? 0} transfer records</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 bg-muted animate-pulse rounded-xl" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!transfers.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No transfers recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.transferNumber}</TableCell>
                      <TableCell className="font-medium text-sm">{t.productName}</TableCell>
                      <TableCell className="text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="font-medium text-foreground">{t.fromWarehouseName}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium text-foreground">{t.toWarehouseName}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {t.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColors[t.status] ?? ""} border-0 text-[10px] capitalize`}
                        >
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {t.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(t.createdAt), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {t.status === "pending" && (
                              <>
                                <DropdownMenuItem
                                  disabled={updateStatusMut.isPending}
                                  onClick={() =>
                                    updateStatusMut.mutate({ id: t.id, status: "completed" })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Mark Completed
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={updateStatusMut.isPending}
                                  onClick={() =>
                                    updateStatusMut.mutate({ id: t.id, status: "cancelled" })
                                  }
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel Transfer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => printTransfer(t)}>
                              <Printer className="h-4 w-4 mr-2" />
                              Print
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeletingId(t.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove transfer record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the transfer log. Stock levels are not automatically reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
