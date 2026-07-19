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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  PercentSquare,
  Banknote,
  RefreshCw,
  Star,
  Package,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface PriceList {
  id: number;
  name: string;
  description: string | null;
  type: string;
  discount_value: string;
  is_default: boolean;
  is_active: boolean;
  currency: string;
  item_count: number;
  created_at: string;
}

interface PreviewItem {
  id: number;
  name: string;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  basePrice: number;
  customPrice: number | null;
  effectivePrice: number;
  saving: number;
  discountPct: number;
  hasOverride: boolean;
  itemId: number | null;
}

/* ── Helpers ─────────────────────────────────────────────── */
const ghc = (v: number) =>
  `₵${v.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_LABELS: Record<string, string> = {
  percentage_discount: "% Discount",
  fixed_discount: "Fixed Discount",
  fixed_price: "Fixed Price",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  percentage_discount: PercentSquare,
  fixed_discount: Tag,
  fixed_price: Banknote,
};

const typeDesc = (type: string, val: number) => {
  if (type === "percentage_discount")
    return val === 0 ? "No global discount" : `${val}% off base price`;
  if (type === "fixed_discount") return `₵${val} off base price`;
  if (type === "fixed_price") return `Fixed at ₵${val}`;
  return "";
};

/* ── Blank form ─────────────────────────────────────────── */
const BLANK = {
  name: "",
  description: "",
  type: "percentage_discount",
  discountValue: "0",
  isDefault: false,
  isActive: true,
};

/* ── Component ──────────────────────────────────────────── */
export default function PriceLists() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchProd, setSearchProd] = useState("");
  const [tab, setTab] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [form, setForm] = useState(BLANK);
  const [editingItem, setEditingItem] = useState<{
    id: number | null;
    productId: number;
    name: string;
    base: number;
    current: number;
  } | null>(null);
  const [itemPrice, setItemPrice] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  /* ── Queries ──────────────────────────────────────────── */
  const { data: lists = [], isLoading } = useQuery<PriceList[]>({
    queryKey: ["price-lists"],
    queryFn: () =>
      customFetch<any>("/api/price-lists").then((d) => (Array.isArray(d) ? d : (d?.data ?? []))),
  });

  const selectedList = lists.find((l) => l.id === selectedId) ?? null;

  const previewParams = new URLSearchParams({ limit: "300" });
  if (searchProd) previewParams.set("search", searchProd);

  const { data: preview, isLoading: previewLoading } = useQuery<{
    list: PriceList;
    items: PreviewItem[];
    total: number;
  }>({
    queryKey: ["price-list-preview", selectedId, searchProd],
    queryFn: () => customFetch(`/api/price-lists/${selectedId}/preview?${previewParams}`),
    enabled: !!selectedId,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const saveMutation = useMutation({
    mutationFn: (data: typeof BLANK) => {
      const payload = {
        name: data.name,
        description: data.description,
        type: data.type,
        discountValue: Number(data.discountValue),
        isDefault: data.isDefault,
        isActive: data.isActive,
        currency: "GHS",
      };
      return editingList
        ? customFetch(`/api/price-lists/${editingList.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : customFetch("/api/price-lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast({ title: editingList ? "Price list updated" : "Price list created" });
      qc.invalidateQueries({ queryKey: ["price-lists"] });
      setFormOpen(false);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/price-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Price list deleted" });
      if (selectedId === confirmDeleteId) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["price-lists"] });
      setConfirmDeleteId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveItemMutation = useMutation({
    mutationFn: ({
      productId,
      price,
      itemId,
    }: {
      productId: number;
      price: number;
      itemId: number | null;
    }) => {
      if (itemId) {
        return customFetch(`/api/price-lists/${selectedId}/items/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customPrice: price }),
        });
      }
      return customFetch(`/api/price-lists/${selectedId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, customPrice: price }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list-preview", selectedId, searchProd] });
      qc.invalidateQueries({ queryKey: ["price-lists"] });
      setEditingItem(null);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      customFetch(`/api/price-lists/${selectedId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list-preview", selectedId, searchProd] });
      qc.invalidateQueries({ queryKey: ["price-lists"] });
    },
  });

  /* ── Derived data ─────────────────────────────────────── */
  let displayItems = preview?.items ?? [];
  if (tab === "overrides") displayItems = displayItems.filter((i) => i.hasOverride);
  if (tab === "discounted") displayItems = displayItems.filter((i) => i.saving > 0);

  /* ── Open form ────────────────────────────────────────── */
  const openCreate = () => {
    setEditingList(null);
    setForm(BLANK);
    setFormOpen(true);
  };
  const openEdit = (list: PriceList) => {
    setEditingList(list);
    setForm({
      name: list.name,
      description: list.description ?? "",
      type: list.type,
      discountValue: String(list.discount_value),
      isDefault: list.is_default,
      isActive: list.is_active,
    });
    setFormOpen(true);
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: list panel ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-sidebar">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-sidebar-foreground">Price Lists</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {lists.map((list) => {
            const TypeIcon = TYPE_ICONS[list.type] ?? Tag;
            const isSelected = list.id === selectedId;
            return (
              <button
                key={list.id}
                onClick={() => setSelectedId(list.id)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors flex items-center gap-2.5 group ${isSelected ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/50 border border-transparent"}`}
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/20" : "bg-muted"}`}
                >
                  <TypeIcon
                    className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium truncate">{list.name}</p>
                    {list.is_default && <Star className="h-2.5 w-2.5 text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {list.item_count} override{list.item_count !== 1 ? "s" : ""}
                    {!list.is_active && " · Inactive"}
                  </p>
                </div>
                <ChevronRight
                  className={`h-3 w-3 shrink-0 transition-opacity ${isSelected ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                />
              </button>
            );
          })}
          {!isLoading && lists.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No price lists yet</div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedList ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <Tag className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Select a price list to view products</p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Price List
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b px-5 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold">{selectedList.name}</h2>
                    {selectedList.is_default && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                        Default
                      </Badge>
                    )}
                    <Badge
                      variant={selectedList.is_active ? "outline" : "secondary"}
                      className="text-[10px]"
                    >
                      {selectedList.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[selectedList.type]} ·{" "}
                    {typeDesc(selectedList.type, Number(selectedList.discount_value))}
                    {selectedList.description ? ` · ${selectedList.description}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openEdit(selectedList)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                {!selectedList.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeleteId(selectedList.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Stats bar */}
            <div className="px-5 py-2 border-b grid grid-cols-4 gap-4 shrink-0">
              {[
                { label: "Products", value: preview?.total ?? "—" },
                {
                  label: "Overrides",
                  value: (preview?.items ?? []).filter((i) => i.hasOverride).length,
                },
                {
                  label: "Avg Discount",
                  value: (() => {
                    const items = (preview?.items ?? []).filter((i) => i.basePrice > 0);
                    if (!items.length) return "0%";
                    const avg = items.reduce((s, i) => s + i.discountPct, 0) / items.length;
                    return `${avg.toFixed(1)}%`;
                  })(),
                },
                {
                  label: "Total Savings",
                  value: ghc((preview?.items ?? []).reduce((s, i) => s + Math.max(0, i.saving), 0)),
                },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="px-5 py-2 border-b flex items-center gap-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search products…"
                  value={searchProd}
                  onChange={(e) => setSearchProd(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3 h-7">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="overrides" className="text-xs px-3 h-7">
                    Overrides
                  </TabsTrigger>
                  <TabsTrigger value="discounted" className="text-xs px-3 h-7">
                    Discounted
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {previewLoading && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Products table */}
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="pl-5">Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Base Price</TableHead>
                    <TableHead className="text-right">List Price</TableHead>
                    <TableHead className="text-right">Saving</TableHead>
                    <TableHead className="text-center">Override</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-10 text-sm"
                      >
                        {previewLoading ? "Loading…" : "No products found"}
                      </TableCell>
                    </TableRow>
                  )}
                  {displayItems.map((item) => {
                    const isEditing = editingItem?.productId === item.id;
                    return (
                      <TableRow key={item.id} className="text-xs group">
                        <TableCell className="pl-5">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.sku && (
                              <p className="text-muted-foreground text-[10px]">{item.sku}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.category ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {ghc(item.basePrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {isEditing ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={itemPrice}
                              onChange={(e) => setItemPrice(e.target.value)}
                              className="h-7 w-28 text-xs text-right ml-auto"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  saveItemMutation.mutate({
                                    productId: item.id,
                                    price: Number(itemPrice),
                                    itemId: item.itemId,
                                  });
                                if (e.key === "Escape") setEditingItem(null);
                              }}
                            />
                          ) : (
                            <span className={item.hasOverride ? "text-primary" : ""}>
                              {ghc(item.effectivePrice)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.saving > 0 ? (
                            <span className="text-emerald-400">
                              {ghc(item.saving)} ({item.discountPct.toFixed(1)}%)
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.hasOverride ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-primary border-primary/30"
                            >
                              Custom
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Auto</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-primary"
                                  onClick={() =>
                                    saveItemMutation.mutate({
                                      productId: item.id,
                                      price: Number(itemPrice),
                                      itemId: item.itemId,
                                    })
                                  }
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={() => setEditingItem(null)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Set custom price"
                                  onClick={() => {
                                    setEditingItem({
                                      id: item.itemId,
                                      productId: item.id,
                                      name: item.name,
                                      base: item.basePrice,
                                      current: item.effectivePrice,
                                    });
                                    setItemPrice(String(item.effectivePrice));
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {item.hasOverride && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground"
                                    title="Remove override"
                                    onClick={() =>
                                      item.itemId && removeItemMutation.mutate(item.itemId)
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingList ? "Edit Price List" : "New Price List"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wholesale"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pricing Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage_discount">% Discount off base</SelectItem>
                    <SelectItem value="fixed_discount">Fixed amount off base</SelectItem>
                    <SelectItem value="fixed_price">Fixed global price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {form.type === "percentage_discount"
                    ? "Discount %"
                    : form.type === "fixed_discount"
                      ? "Discount Amount (₵)"
                      : "Fixed Price (₵)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step={form.type === "percentage_discount" ? "0.5" : "0.01"}
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  id="sw-active"
                />
                <Label htmlFor="sw-active" className="text-xs cursor-pointer">
                  Active
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
                  id="sw-default"
                />
                <Label htmlFor="sw-default" className="text-xs cursor-pointer">
                  Default list
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editingList ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete dialog ── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Price List?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the price list and all its product overrides. This cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
