import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Play,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

/* ── Constants ──────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  in_progress: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};
const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(v);
const fmt = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* ── Types ──────────────────────────────────────────────── */
interface StockTake {
  id: number;
  title: string;
  warehouse_name: string | null;
  status: string;
  total_items: number;
  counted_items: number;
  total_variance: number;
  total_variance_value: string;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}
interface StockTakeItem {
  id: number;
  stock_take_id: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  product_category: string | null;
  expected_qty: number;
  counted_qty: number | null;
  variance: number | null;
  unit_price: string;
  variance_value: string | null;
  notes: string | null;
  counted_at: string | null;
  counted_by: string | null;
}
interface StockTakeDetail extends StockTake {
  items: StockTakeItem[];
}
interface Warehouse {
  id: number;
  name: string;
}

/* ── Item row component ─────────────────────────────────── */
function ItemRow({
  item,
  editable,
  onSave,
}: {
  item: StockTakeItem;
  editable: boolean;
  onSave: (id: number, qty: number | null, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.counted_qty !== null ? String(item.counted_qty) : "");
  const [notes, setNotes] = useState(item.notes ?? "");

  const variance = item.counted_qty !== null ? item.counted_qty - item.expected_qty : null;
  const isCounted = item.counted_qty !== null;

  const save = () => {
    const parsed = qty === "" ? null : parseInt(qty);
    onSave(item.id, parsed, notes);
    setEditing(false);
  };

  return (
    <TableRow className={isCounted && variance !== 0 ? "bg-amber-500/5" : ""}>
      <TableCell>
        <div className="font-medium text-sm">{item.product_name}</div>
        <div className="text-[10px] text-muted-foreground">
          {item.product_sku ?? ""} {item.product_category ? `· ${item.product_category}` : ""}
        </div>
      </TableCell>
      <TableCell className="text-center font-mono text-sm">{item.expected_qty}</TableCell>
      <TableCell className="text-center">
        {editing ? (
          <Input
            autoFocus
            type="number"
            min="0"
            className="h-7 text-xs w-20 text-center mx-auto font-mono"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            className={`font-mono text-sm px-2 py-0.5 rounded min-w-12 text-center
              ${!isCounted ? "text-muted-foreground italic text-xs" : ""}
              ${editable ? "hover:bg-muted cursor-pointer" : "cursor-default"}
            `}
            onClick={() => editable && setEditing(true)}
          >
            {isCounted ? item.counted_qty : "—"}
          </button>
        )}
      </TableCell>
      <TableCell className="text-center">
        {variance !== null ? (
          <span
            className={`font-semibold text-sm inline-flex items-center gap-0.5 ${
              variance > 0
                ? "text-emerald-400"
                : variance < 0
                  ? "text-red-400"
                  : "text-muted-foreground"
            }`}
          >
            {variance > 0 && <TrendingUp className="h-3 w-3" />}
            {variance < 0 && <TrendingDown className="h-3 w-3" />}
            {variance > 0 ? "+" : ""}
            {variance}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground hidden lg:table-cell">
        {variance !== null && variance !== 0 ? (
          <span className={variance > 0 ? "text-emerald-400" : "text-red-400"}>
            {GHS(Math.abs(Number(item.variance_value ?? 0)))}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {editing ? (
          <Input
            className="h-7 text-xs w-32"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note…"
          />
        ) : (
          <span className="text-xs text-muted-foreground">{item.notes || "—"}</span>
        )}
      </TableCell>
      {editable && (
        <TableCell>
          {editing ? (
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={save}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setEditing(false)}
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setQty(item.counted_qty !== null ? String(item.counted_qty) : "");
                setNotes(item.notes ?? "");
                setEditing(true);
              }}
            >
              {isCounted ? "Edit" : "Count"}
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

/* ── Detail view ─────────────────────────────────────────── */
function StockTakeDetail({ takeId, onBack }: { takeId: number; onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [showComplete, setShowComplete] = useState(false);
  const [commitAdj, setCommitAdj] = useState(true);

  const { data: take, isLoading } = useQuery<StockTakeDetail>({
    queryKey: ["stock-take", takeId],
    queryFn: () => customFetch(`/api/stock-takes/${takeId}`),
    refetchInterval: 10000,
  });

  const updateItem = useMutation({
    mutationFn: ({
      itemId,
      countedQty,
      notes,
    }: {
      itemId: number;
      countedQty: number | null;
      notes: string;
    }) =>
      customFetch(`/api/stock-takes/${takeId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ countedQty, notes: notes || null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-take", takeId] }),
    onError: () => toast({ title: "Failed to save count", variant: "destructive" }),
  });

  const startTake = useMutation({
    mutationFn: () => customFetch(`/api/stock-takes/${takeId}/start`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: "Stock take started" });
      qc.invalidateQueries({ queryKey: ["stock-take", takeId] });
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
    },
  });

  const completeTake = useMutation({
    mutationFn: () =>
      customFetch(`/api/stock-takes/${takeId}/complete`, {
        method: "POST",
        body: JSON.stringify({ commitAdjustments: commitAdj }),
      }),
    onSuccess: (data: any) => {
      toast({
        title: data.committed ? "Completed & stock adjusted" : "Completed (no adjustments)",
      });
      qc.invalidateQueries({ queryKey: ["stock-take", takeId] });
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      setShowComplete(false);
    },
    onError: () => toast({ title: "Failed to complete", variant: "destructive" }),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!take) return <div className="p-6 text-muted-foreground">Not found</div>;

  const items = take.items ?? [];
  const categories = [...new Set(items.map((i) => i.product_category).filter(Boolean))] as string[];

  let filtered = items;
  if (filterCat !== "all") filtered = filtered.filter((i) => i.product_category === filterCat);
  if (filterState === "counted") filtered = filtered.filter((i) => i.counted_qty !== null);
  if (filterState === "uncounted") filtered = filtered.filter((i) => i.counted_qty === null);
  if (filterState === "variance")
    filtered = filtered.filter((i) => i.counted_qty !== null && i.counted_qty !== i.expected_qty);
  if (search)
    filtered = filtered.filter(
      (i) =>
        i.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (i.product_sku?.toLowerCase() ?? "").includes(search.toLowerCase()),
    );

  const variances = items.filter((i) => i.counted_qty !== null && i.counted_qty !== i.expected_qty);
  const countedCount = items.filter((i) => i.counted_qty !== null).length;
  const progress = take.total_items > 0 ? Math.round((countedCount / take.total_items) * 100) : 0;
  const totalVarVal = variances.reduce((s, i) => s + Number(i.variance_value ?? 0), 0);
  const editable = ["draft", "in_progress"].includes(take.status);

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{take.title}</h2>
          <p className="text-xs text-muted-foreground">
            {take.warehouse_name ?? "All Locations"} · Created {fmt(take.created_at)}
            {take.created_by ? ` by ${take.created_by}` : ""}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`capitalize text-xs ${STATUS_COLORS[take.status] ?? ""}`}
        >
          {take.status.replace("_", " ")}
        </Badge>
        {isAdmin && take.status === "draft" && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => startTake.mutate()}
            disabled={startTake.isPending}
          >
            <Play className="h-3.5 w-3.5" />
            Start Count
          </Button>
        )}
        {isAdmin && take.status === "in_progress" && (
          <Button
            size="sm"
            variant="default"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setShowComplete(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </Button>
        )}
      </div>

      {/* Progress + summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-2 sm:col-span-2 border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Count Progress</p>
              <span className="text-xs font-semibold text-blue-400">{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {countedCount} of {take.total_items} items counted
            </p>
          </CardContent>
        </Card>
        <Card className={`border-amber-500/20 bg-amber-500/5`}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Variances</p>
            <p className="text-xl font-bold text-amber-400">{variances.length}</p>
            <p className="text-[10px] text-muted-foreground">items with discrepancy</p>
          </CardContent>
        </Card>
        <Card
          className={`${totalVarVal < 0 ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}
        >
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Value Variance</p>
            <p
              className={`text-xl font-bold ${totalVarVal < 0 ? "text-red-400" : "text-emerald-400"}`}
            >
              {totalVarVal >= 0 ? "+" : ""}
              {GHS(totalVarVal)}
            </p>
            <p className="text-[10px] text-muted-foreground">vs system value</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {categories.length > 0 && (
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="counted">Counted</SelectItem>
            <SelectItem value="uncounted">Uncounted</SelectItem>
            <SelectItem value="variance">Variances Only</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground flex items-center ml-auto">
          {filtered.length} / {items.length} items
        </span>
      </div>

      {/* Items table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Product</TableHead>
              <TableHead className="text-xs text-center">Expected</TableHead>
              <TableHead className="text-xs text-center">Counted</TableHead>
              <TableHead className="text-xs text-center">Variance</TableHead>
              <TableHead className="text-xs text-right hidden lg:table-cell">Value Δ</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Notes</TableHead>
              {editable && <TableHead className="text-xs w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No items match the current filter
                </TableCell>
              </TableRow>
            )}
            {filtered.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                editable={editable && isAdmin}
                onSave={(itemId, countedQty, notes) =>
                  updateItem.mutate({ itemId, countedQty, notes })
                }
              />
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Complete dialog */}
      <AlertDialog open={showComplete} onOpenChange={setShowComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Complete Stock Take
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                {countedCount} of {take.total_items} items counted.
                {variances.length > 0 &&
                  ` ${variances.length} variances found (${GHS(Math.abs(totalVarVal))}).`}
              </span>
              <label className="flex items-center gap-2 cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={commitAdj}
                  onChange={(e) => setCommitAdj(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="text-sm font-medium">
                  Commit adjustments — update product stock to match counted quantities
                </span>
              </label>
              {!commitAdj && (
                <span className="text-xs text-amber-400 block">
                  Stock levels will NOT be changed. This is a record-only completion.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => completeTake.mutate()}
              disabled={completeTake.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completeTake.isPending ? "Processing…" : "Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Main list page ──────────────────────────────────────── */
export default function StockTake() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [activeTakeId, setActiveTakeId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", warehouseId: "all", notes: "" });

  const {
    data: takes,
    isLoading,
    refetch,
  } = useQuery<StockTake[]>({
    queryKey: ["stock-takes"],
    queryFn: () =>
      customFetch<any>("/api/stock-takes").then((d) => (Array.isArray(d) ? d : (d?.data ?? []))),
  });

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["warehouses-list"],
    queryFn: () => customFetch("/api/warehouses").then((d: any) => d.data ?? d),
  });

  const createTake = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/stock-takes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      toast({ title: `Stock take created — ${data.itemCount} items loaded` });
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      setShowCreate(false);
      setForm({ title: "", warehouseId: "all", notes: "" });
      setActiveTakeId(data.id);
    },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const deleteTake = useMutation({
    mutationFn: (id: number) => customFetch(`/api/stock-takes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      setDeleteId(null);
    },
  });

  if (activeTakeId !== null) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <StockTakeDetail takeId={activeTakeId} onBack={() => setActiveTakeId(null)} />
      </div>
    );
  }

  const rows = takes ?? [];
  const active = rows.filter((t) => t.status === "in_progress");
  const draft = rows.filter((t) => t.status === "draft");
  const done = rows.filter((t) => t.status === "completed");

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Stock Take</h1>
            <p className="text-xs text-muted-foreground">
              Physical count sessions — verify and reconcile inventory
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Count
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">In Progress</p>
            <p className="text-2xl font-bold text-blue-400">{active.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-500/20 bg-slate-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Draft</p>
            <p className="text-2xl font-bold text-slate-400">{draft.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Completed</p>
            <p className="text-2xl font-bold text-emerald-400">{done.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active sessions callout */}
      {active.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-blue-300 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Active Count Sessions
            </p>
            <div className="space-y-2">
              {active.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {t.warehouse_name ?? "All"}
                    </span>
                  </div>
                  <div className="text-xs text-blue-300">
                    {t.counted_items}/{t.total_items} counted
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setActiveTakeId(t.id)}>
                    Continue →
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Session</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Location</TableHead>
              <TableHead className="text-xs text-center">Progress</TableHead>
              <TableHead className="text-xs text-right hidden md:table-cell">Variance</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Date</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No stock take sessions yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => {
              const progress =
                t.total_items > 0 ? Math.round((t.counted_items / t.total_items) * 100) : 0;
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setActiveTakeId(t.id)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{t.title}</div>
                    {t.created_by && (
                      <div className="text-[10px] text-muted-foreground">by {t.created_by}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm hidden sm:table-cell">
                    {t.warehouse_name ?? (
                      <span className="text-muted-foreground">All Locations</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden min-w-12">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 shrink-0">
                        {progress}%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t.counted_items}/{t.total_items}
                    </p>
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    {t.status === "completed" && t.total_variance !== 0 ? (
                      <span
                        className={`text-sm font-semibold ${Number(t.total_variance) > 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {Number(t.total_variance) > 0 ? "+" : ""}
                        {t.total_variance} units
                        <div className="text-[10px] font-normal">
                          {GHS(Math.abs(Number(t.total_variance_value)))}
                        </div>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                    {fmt(t.created_at)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${STATUS_COLORS[t.status] ?? ""}`}
                    >
                      {t.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setActiveTakeId(t.id)}
                      >
                        Open
                      </Button>
                      {isAdmin && (t.status === "draft" || t.status === "cancelled") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteId(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Stock Take Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Session Title *
              </label>
              <Input
                className="h-8 text-xs"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Monthly Count – May 2026"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Location
              </label>
              <Select
                value={form.warehouseId}
                onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations (entire inventory)</SelectItem>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Selecting a warehouse counts only stock assigned to that location.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
              <Textarea
                className="text-xs"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes for this session…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createTake.mutate({
                  title: form.title.trim(),
                  warehouseId: form.warehouseId === "all" ? null : Number(form.warehouseId),
                  notes: form.notes || null,
                })
              }
              disabled={createTake.isPending || !form.title.trim()}
            >
              {createTake.isPending ? "Creating…" : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock take session?</AlertDialogTitle>
            <AlertDialogDescription>
              All count data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteTake.mutate(deleteId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
