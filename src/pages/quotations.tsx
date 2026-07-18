import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { fetchAllProductOptions } from "@/lib/product-options";
import type { ProductOption } from "@/lib/product-options";
import { fetchAllCustomerOptions } from "@/lib/customer-options";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  PlusCircle,
  X,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type QItem = {
  productId: string;
  productName: string;
  categoryId: string | null;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
type Quote = {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  validUntil: string | null;
  notes: string | null;
  items: QItem[];
  createdAt: string;
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);
const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function ProductPicker({
  products,
  value,
  onSelect,
  loading,
}: {
  products: ProductOption[];
  value: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => String(product.id) === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between rounded-[20px] px-3 text-xs font-normal"
        >
          <span className="truncate">{selected ? selected.name : "Select product"}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by product name or SKU…" />
          <CommandList className="max-h-64">
            <CommandEmpty>{loading ? "Loading products…" : "No matching products"}</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.sku ?? ""}`}
                  onSelect={() => {
                    onSelect(String(product.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value === String(product.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{product.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {product.category ?? "Other"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function QuoteForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Quote>;
  onSave: (d: Partial<Quote>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["product-options", "quotations"],
    queryFn: fetchAllProductOptions,
  });
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customer-options", "quotations"],
    queryFn: fetchAllCustomerOptions,
  });
  const { data: categoryResponse } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["product-categories", "quotation-filter"],
    queryFn: () => customFetch("/api/product-categories"),
  });
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [tax, setTax] = useState(String(initial?.tax ?? "0"));
  const [discount, setDiscount] = useState(String(initial?.discount ?? "0"));
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<QItem[]>(initial?.items ?? []);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const filteredProducts =
    categoryFilter === "all"
      ? products
      : products.filter((product) => product.categoryId === categoryFilter);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const total = subtotal + Number(tax) - Number(discount);

  const addItem = () =>
    setItems([
      ...items,
      {
        productId: "",
        productName: "",
        categoryId: null,
        categoryName: "Other",
        quantity: 1,
        unitPrice: 0,
        total: 0,
      },
    ]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof QItem, value: string | number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "productId") {
      const p = products.find((pr) => String(pr.id) === String(value));
      if (p) {
        updated[idx].productName = p.name;
        updated[idx].categoryId = p.categoryId ?? null;
        updated[idx].categoryName = p.category ?? "Other";
        updated[idx].unitPrice = Number(p.price);
      }
    }
    updated[idx].total = updated[idx].quantity * updated[idx].unitPrice;
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !items.some((item) => item.productId && item.quantity > 0)) return;
    onSave({
      customerId,
      status,
      tax: Number(tax),
      discount: Number(discount),
      validUntil: validUntil || null,
      notes: notes || null,
      items,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2 max-h-[80vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium">Customer *</label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="rounded-[20px] mt-1">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customersLoading && (
                <SelectItem value="loading" disabled>
                  Loading customers…
                </SelectItem>
              )}
              {!customersLoading && !customers.length && (
                <SelectItem value="empty" disabled>
                  No customers available
                </SelectItem>
              )}
              {customers.map((c) => (
                <SelectItem key={c.uuidId} value={c.uuidId}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="rounded-[20px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["draft", "sent", "accepted", "rejected"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Valid Until</label>
          <Input
            id="quote-valid-until"
            name="validUntil"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="rounded-[20px] mt-1"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium">Line Items</label>
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-7 w-40 rounded-full text-xs">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full h-7 text-xs gap-1"
              onClick={addItem}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add Item
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <ProductPicker
                  products={filteredProducts}
                  value={String(item.productId || "")}
                  onSelect={(value) => updateItem(idx, "productId", value)}
                  loading={productsLoading}
                />
              </div>
              <Input
                className="col-span-2 rounded-[20px] h-8 text-xs"
                type="number"
                min="1"
                name={`items[${idx}].quantity`}
                value={item.quantity}
                onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                placeholder="Qty"
              />
              <Input
                className="col-span-2 rounded-[20px] h-8 text-xs"
                type="number"
                min="0"
                step="0.01"
                name={`items[${idx}].unitPrice`}
                value={item.unitPrice}
                onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                placeholder="Price"
              />
              <div className="col-span-2 text-xs font-medium text-right">{GHS(item.total)}</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="col-span-1 h-7 w-7"
                onClick={() => removeItem(idx)}
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          {!items.length && (
            <div className="text-xs text-muted-foreground py-2 text-center">
              No items yet. Click Add Item.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium">Tax (GHS)</label>
          <Input
            id="quote-tax"
            name="tax"
            type="number"
            min="0"
            step="0.01"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            className="rounded-[20px] mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Discount (GHS)</label>
          <Input
            id="quote-discount"
            name="discount"
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="rounded-[20px] mt-1"
          />
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">{GHS(total)}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium">Notes</label>
        <Textarea
          id="quote-notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-[20px] mt-1"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="rounded-full"
          disabled={
            isPending || !customerId || !items.some((item) => item.productId && item.quantity > 0)
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial?.id ? "Update Quote" : "Create Quote"}
        </Button>
      </div>
    </form>
  );
}

export default function Quotations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["quotations"] });

  const { data, isLoading } = useQuery<{ data: Quote[]; total: number }>({
    queryKey: ["quotations", search, statusFilter],
    queryFn: () =>
      customFetch(
        `/api/quotations?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`,
      ),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Quote>) =>
      customFetch("/api/quotations", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Quotation created" });
      setCreating(false);
      invalidate();
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Quote> & { id: string }) =>
      customFetch(`/api/quotations/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Quotation updated" });
      setEditing(null);
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => customFetch(`/api/quotations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Quotation deleted" });
      setDeletingId(null);
      invalidate();
    },
  });

  const quotes = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quotations</h2>
          <p className="text-muted-foreground">Create and manage customer quotations.</p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="h-4 w-4" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Quotation</DialogTitle>
            </DialogHeader>
            <QuoteForm
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isPending={createMut.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="quotes-search"
                name="search"
                placeholder="Search quotations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-full"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="rounded-full w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {["draft", "sent", "accepted", "rejected"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="h-40 bg-muted animate-pulse rounded-xl m-4" />
          ) : (
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!quotes.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No quotations found
                    </TableCell>
                  </TableRow>
                ) : (
                  quotes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{q.quoteNumber}</TableCell>
                      <TableCell className="font-medium text-sm">{q.customerName}</TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColor[q.status] ?? ""} border-0 text-[10px] capitalize`}
                        >
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{GHS(q.total)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {q.validUntil ? format(new Date(q.validUntil), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(q.createdAt), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(q)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeletingId(q.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Quotation</DialogTitle>
          </DialogHeader>
          {editing && (
            <QuoteForm
              initial={editing}
              onSave={(d) => updateMut.mutate({ ...d, id: editing.id })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the quotation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
