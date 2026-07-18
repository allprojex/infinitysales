import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fetchAllProductOptions } from "@/lib/product-options";

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
  createdAt: string;
};
type Warehouse = { id: number; name: string; location: string | null };

function useWarehouses() {
  return useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: () => customFetch("/api/warehouses"),
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
  const [toWh, setToWh] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});
  const [productSearch, setProductSearch] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: whData } = useWarehouses();
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
  const warehouses = whData ?? [];

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
      setToWh("");
      setReason("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(selectedProducts).map(([productId, quantity]) => ({
      productId,
      productName: products.find((product) => String(product.id) === productId)?.name,
      quantity: Number(quantity),
    }));
    if (!toWh || !items.length || items.some((item) => item.quantity < 1)) return;
    createMut.mutate({
      items,
      fromWarehouseId: null,
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
                      const stock = Number(product.stock ?? 0);
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
                              {product.category ?? "Other"} · General stock: {stock}
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
                            max={Number(product?.stock ?? 0)}
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
                  <Input value="General Warehouse" disabled className="rounded-[20px] mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">To Warehouse *</label>
                  <Select value={toWh} onValueChange={setToWh}>
                    <SelectTrigger className="rounded-[20px] mt-1">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                    !Object.keys(selectedProducts).length ||
                    Object.entries(selectedProducts).some(([id, quantity]) => {
                      const product = products.find((candidate) => String(candidate.id) === id);
                      return Number(quantity) < 1 || Number(quantity) > Number(product?.stock ?? 0);
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
