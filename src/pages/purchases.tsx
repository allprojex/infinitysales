import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListProducts, getListProductsQueryKey } from "@/workspace/api-client-react";
import { customFetch } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  ShoppingBag,
  MoreVertical,
  Trash2,
  Loader2,
  Check,
  Package,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FileImportDialog } from "@/components/FileImportDialog";
import { Textarea } from "@/components/ui/textarea";

type POItem = { productId: number; productName: string; quantity: number; unitCost: number };
type PO = {
  id: number;
  poNumber: string;
  supplierName: string;
  status: string;
  subtotal: string;
  total: string;
  notes: string | null;
  expectedDate: string | null;
  receivedDate: string | null;
  createdAt: string;
  items?: POItem[];
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

function statusColor(s: string) {
  switch (s) {
    case "draft":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    case "ordered":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
    case "received":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    case "cancelled":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    default:
      return "";
  }
}

function usePOs(status: string, search: string) {
  return useQuery<{ data: PO[]; total: number; page: number; limit: number }>({
    queryKey: ["purchase-orders", status, search],
    queryFn: () =>
      customFetch(
        `/api/purchase-orders?limit=50${status !== "all" ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

function usePODetail(id: number | null) {
  return useQuery<PO & { items: POItem[] }>({
    queryKey: ["purchase-order", id],
    queryFn: () => customFetch(`/api/purchase-orders/${id}`),
    enabled: id !== null,
  });
}

function CreatePODialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<POItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    categoryId: "",
    unitCost: "",
    price: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: productsData } = useListProducts(
    { search: productSearch || undefined, limit: 20 },
    {
      query: {
        queryKey: getListProductsQueryKey({ search: productSearch || undefined, limit: 20 }),
      },
    },
  );
  const { data: suppliersData } = useQuery<{ data: Array<{ id: number; name: string }> }>({
    queryKey: ["suppliers", "po-picker", supplierName],
    queryFn: () =>
      customFetch(
        `/api/suppliers?limit=50${supplierName ? `&search=${encodeURIComponent(supplierName)}` : ""}`,
      ),
    enabled: open,
  });
  const { data: categoriesData } = useQuery<{
    data: Array<{ id: string; name: string; isActive: boolean }>;
  }>({
    queryKey: ["product-categories", "active"],
    queryFn: () => customFetch("/api/product-categories?active=true"),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (d: object) =>
      customFetch("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify(d),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      toast({ title: "Purchase order created" });
      setOpen(false);
      reset();
      onCreated();
    },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const createProductMut = useMutation({
    mutationFn: () =>
      customFetch<{ id: number; name: string; price: number }>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProduct.name.trim(),
          sku: newProduct.sku.trim() || undefined,
          categoryId: newProduct.categoryId,
          cost: Number(newProduct.unitCost),
          price: Number(newProduct.price || newProduct.unitCost),
          stock: 0,
        }),
      }),
    onSuccess: (product) => {
      addItem({ id: product.id, name: product.name, price: Number(newProduct.unitCost) });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setNewProduct({ name: "", sku: "", categoryId: "", unitCost: "", price: "" });
      setShowNewProduct(false);
      toast({ title: "Product created and added to order" });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Could not create product", description: e.message }),
  });

  const reset = () => {
    setSupplierName("");
    setExpectedDate("");
    setNotes("");
    setLineItems([]);
    setProductSearch("");
    setSupplierPickerOpen(false);
    setProductPickerOpen(false);
    setShowNewProduct(false);
    setNewProduct({ name: "", sku: "", categoryId: "", unitCost: "", price: "" });
  };

  const addItem = (p: { id: number; name: string; price: number }) => {
    if (lineItems.find((i) => i.productId === p.id)) return;
    setLineItems((l) => [
      ...l,
      { productId: p.id, productName: p.name, quantity: 1, unitCost: p.price },
    ]);
    setProductSearch("");
    setProductPickerOpen(false);
  };

  const updateItem = (idx: number, field: "quantity" | "unitCost", val: number) =>
    setLineItems((l) => l.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="rounded-full gap-2">
          <Plus className="h-4 w-4" />
          New Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Supplier Name *</label>
              <div className="relative">
                <Input
                  id="po-supplier-name"
                  name="supplierName"
                  placeholder="Search suppliers…"
                  value={supplierName}
                  onFocus={() => setSupplierPickerOpen(true)}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    setSupplierPickerOpen(true);
                  }}
                  className="rounded-[20px]"
                  autoComplete="off"
                />
                {supplierPickerOpen && suppliersData && (
                  <div className="absolute z-50 left-0 right-0 mt-1 border rounded-xl overflow-hidden bg-card shadow-md max-h-44 overflow-y-auto">
                    {suppliersData.data.length ? (
                      [...suppliersData.data]
                        .sort((a, b) =>
                          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
                        )
                        .map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            className="w-full px-3 py-2 hover:bg-muted text-sm text-left"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSupplierName(s.name);
                              setSupplierPickerOpen(false);
                            }}
                          >
                            {s.name}
                          </button>
                        ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        No matching suppliers
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Expected Date</label>
              <Input
                id="po-expected-date"
                name="expectedDate"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="rounded-[20px]"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Add Products</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="po-product-search"
                name="productSearch"
                placeholder="Search products to add…"
                className="pl-9 rounded-[20px]"
                value={productSearch}
                onFocus={() => setProductPickerOpen(true)}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setProductPickerOpen(true);
                }}
                autoComplete="off"
              />
            </div>
            {productPickerOpen && productsData && productsData.data.length > 0 && (
              <div className="mt-1 border rounded-xl overflow-hidden bg-card shadow-md max-h-44 overflow-y-auto">
                {[...productsData.data]
                  .filter((p) => !lineItems.find((l) => l.productId === p.id))
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                  .map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-sm text-left"
                      onClick={() => addItem({ id: p.id, name: p.name, price: Number(p.price) })}
                    >
                      <span>
                        <span className="block">{p.name}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {p.category ?? "Other"}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs">{GHS(Number(p.price))}</span>
                    </button>
                  ))}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-8 gap-1.5 text-xs"
              onClick={() => {
                setShowNewProduct((v) => !v);
                setNewProduct((p) => ({ ...p, name: p.name || productSearch }));
                setProductPickerOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add a new product to the system
            </Button>
            {showNewProduct && (
              <div className="mt-2 rounded-xl border bg-muted/20 p-3 space-y-3">
                <p className="text-sm font-medium">New product</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Product name *"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                  />
                  <Input
                    placeholder="SKU (optional)"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))}
                  />
                  <Select
                    value={newProduct.categoryId}
                    onValueChange={(categoryId) => setNewProduct((p) => ({ ...p, categoryId }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Category *" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesData?.data.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Purchase cost *"
                    value={newProduct.unitCost}
                    onChange={(e) => setNewProduct((p) => ({ ...p, unitCost: e.target.value }))}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Selling price"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewProduct(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !newProduct.name.trim() ||
                      !newProduct.categoryId ||
                      newProduct.unitCost === "" ||
                      createProductMut.isPending
                    }
                    onClick={() => createProductMut.mutate()}
                  >
                    {createProductMut.isPending && (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    )}
                    Create & Add
                  </Button>
                </div>
              </div>
            )}
          </div>

          {lineItems.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-5">Product</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-center">Unit Cost (₵)</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              {lineItems.map((item, idx) => (
                <div
                  key={item.productId}
                  className="grid grid-cols-12 items-center gap-1 bg-muted/30 rounded-xl px-2 py-1.5"
                >
                  <div className="col-span-5 text-sm font-medium truncate">{item.productName}</div>
                  <div className="col-span-2 flex justify-center">
                    <Input
                      type="number"
                      min={1}
                      name={`items[${idx}].quantity`}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                      className="h-7 w-14 text-center rounded-lg text-xs p-1"
                    />
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      name={`items[${idx}].unitCost`}
                      value={item.unitCost}
                      onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                      className="h-7 w-24 text-center rounded-lg text-xs p-1"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-xs font-medium">
                      {GHS(item.quantity * item.unitCost)}
                    </span>
                    <button
                      onClick={() => setLineItems((l) => l.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive ml-1"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="font-bold text-sm">Subtotal: {GHS(subtotal)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1">Notes</label>
            <Textarea
              id="po-notes"
              name="notes"
              placeholder="Notes for this PO…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-[20px] resize-none"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={!supplierName.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  supplierName,
                  expectedDate: expectedDate || null,
                  notes: notes || null,
                  items: lineItems,
                })
              }
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create PO
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Purchases() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = usePOs(statusFilter, search);
  const { data: poDetail } = usePODetail(viewingId);
  const pos = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  };

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/purchase-orders/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const receivePO = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/purchase-orders/${id}/receive`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Stock updated — PO received!" });
      setViewingId(null);
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deletePO = useMutation({
    mutationFn: (id: number) => customFetch(`/api/purchase-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Purchase order deleted" });
      setDeletingId(null);
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchase Orders</h2>
          <p className="text-muted-foreground">
            Create and track purchase orders from suppliers — receiving updates stock automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-full gap-2"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4" /> Import
          </Button>
          <FileImportDialog
            type="purchases"
            open={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onSuccess={invalidate}
          />
          <CreatePODialog onCreated={invalidate} />
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="po-search"
            name="search"
            placeholder="Search supplier…"
            className="pl-9 rounded-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Detail Drawer */}
      {viewingId !== null && poDetail && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" /> {poDetail.poNumber}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{poDetail.supplierName}</p>
            </div>
            <div className="flex items-center gap-2">
              {poDetail.status !== "received" && poDetail.status !== "cancelled" && (
                <Button
                  size="sm"
                  className="rounded-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => receivePO.mutate(poDetail.id)}
                  disabled={receivePO.isPending}
                >
                  {receivePO.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Receive & Update Stock
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setViewingId(null)}
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {poDetail.items?.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{item.productName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{item.quantity} units</span>
                    <span>{GHS(item.unitCost)} each</span>
                    <span className="font-bold text-foreground">
                      {GHS(item.quantity * item.unitCost)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 text-sm font-bold border-t mt-2">
                Total: {GHS(Number(poDetail.total))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deletingId && deletePO.mutate(deletingId)}
              disabled={deletePO.isPending}
            >
              {deletePO.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : pos.length === 0 ? (
        <div className="bg-card rounded-3xl border border-dashed border-muted-foreground/20 p-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-1">No purchase orders yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first PO to restock from suppliers and auto-update inventory on receipt.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border overflow-x-auto shadow-sm">
          <div className="grid grid-cols-6 px-4 py-2 border-b text-xs font-medium text-muted-foreground bg-muted/30 min-w-[560px]">
            <div>PO Number</div>
            <div className="col-span-2">Supplier</div>
            <div>Status</div>
            <div>Expected</div>
            <div className="text-right">Total</div>
          </div>
          {pos.map((po) => (
            <div
              key={po.id}
              className={`grid grid-cols-6 px-4 py-3 border-b last:border-0 items-center text-sm cursor-pointer hover:bg-muted/20 transition-colors min-w-[560px] ${viewingId === po.id ? "bg-primary/5" : ""}`}
              onClick={() => setViewingId(viewingId === po.id ? null : po.id)}
            >
              <div className="font-mono text-xs font-medium text-primary">{po.poNumber}</div>
              <div className="col-span-2 font-medium">{po.supplierName}</div>
              <div>
                <Badge className={`text-[10px] border-0 ${statusColor(po.status)}`}>
                  {po.status}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString("en-GH") : "—"}
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="font-semibold">{GHS(Number(po.total))}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {po.status === "draft" && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: po.id, status: "ordered" });
                        }}
                      >
                        Mark as Ordered
                      </DropdownMenuItem>
                    )}
                    {po.status !== "received" && po.status !== "cancelled" && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          receivePO.mutate(po.id);
                        }}
                      >
                        <Check className="h-4 w-4 mr-2 text-emerald-600" />
                        Receive & Update Stock
                      </DropdownMenuItem>
                    )}
                    {po.status !== "received" && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: po.id, status: "cancelled" });
                        }}
                      >
                        Cancel
                      </DropdownMenuItem>
                    )}
                    {po.status !== "received" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(po.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {data?.total ?? 0} purchase order{(data?.total ?? 0) !== 1 ? "s" : ""} total
      </p>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
