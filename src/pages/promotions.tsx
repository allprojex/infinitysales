import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Tag, Plus, Pencil, Trash2, RefreshCw, Search,
  Pause, Play, ChevronLeft, ChevronRight, Copy, Clock, CheckCircle2, XCircle, FileText,
} from "lucide-react";

/* ── Constants ──────────────────────────────────────────── */
const TYPE_LABELS: Record<string, string> = {
  percentage: "% Off", fixed: "Fixed Amount", buy_x_get_y: "Buy X Get Y",
};
const TYPE_COLORS: Record<string, string> = {
  percentage: "bg-blue-500/15 text-blue-300",
  fixed:      "bg-emerald-500/15 text-emerald-300",
  buy_x_get_y:"bg-purple-500/15 text-purple-300",
};
const STATUS_COLORS: Record<string, string> = {
  active:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  paused:  "bg-amber-500/20  text-amber-300  border-amber-500/30",
  draft:   "bg-slate-500/20  text-slate-300  border-slate-500/30",
  expired: "bg-red-500/20    text-red-300    border-red-500/30",
};
const APPLIES_LABELS: Record<string, string> = { all: "All Products", category: "By Category", product: "Specific Products" };

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(v);

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });

/* ── Types ──────────────────────────────────────────────── */
interface Promotion {
  id: number; name: string; description: string | null;
  type: string; value: string;
  buyQuantity: number | null; getQuantity: number | null;
  minOrderAmount: string; maxDiscountAmount: string | null;
  startDate: string; endDate: string; status: string;
  appliesTo: string; targetCategory: string | null;
  targetProductIds: number[];
  promoCode: string | null;
  usageCount: number; usageLimit: number | null;
  createdBy: string | null; createdAt: string;
}
interface PromosResp { data: Promotion[]; total: number; page: number; limit: number; }
interface StatsResp {
  active: number; paused: number; expired: number; draft: number;
  upcoming: number; totalUses: number;
  topByUsage: { name: string; usageCount: number }[];
}

const EMPTY_FORM = {
  name: "", description: "",
  type: "percentage", value: "",
  buyQuantity: "", getQuantity: "",
  minOrderAmount: "", maxDiscountAmount: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split("T")[0]; })(),
  status: "draft",
  appliesTo: "all", targetCategory: "",
  promoCode: "", usageLimit: "",
};

/* ── Component ──────────────────────────────────────────── */
export default function Promotions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [tab, setTab]               = useState("all");
  const [search, setSearch]         = useState("");
  const [filterType, setFilterType] = useState("all");
  const [page, setPage]             = useState(1);
  const [showForm, setShowForm]     = useState(false);
  const [editPromo, setEditPromo]   = useState<Promotion | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);

  /* ── Queries ──────────────────────────────────────────── */
  const { data: stats, refetch: refetchStats } = useQuery<StatsResp>({
    queryKey: ["promos-stats"],
    queryFn: () => customFetch("/api/promotions/stats"),
  });

  const statusFilter = tab === "all" ? null : tab;
  const params = new URLSearchParams({ limit: "50", page: String(page) });
  if (statusFilter)           params.set("status", statusFilter);
  if (filterType !== "all")   params.set("type",   filterType);
  if (search)                 params.set("search",  search);

  const { data, isLoading, refetch } = useQuery<PromosResp>({
    queryKey: ["promotions", tab, filterType, search, page],
    queryFn: () => customFetch(`/api/promotions?${params}`),
  });

  /* ── Mutations ────────────────────────────────────────── */
  const createPromo = useMutation({
    mutationFn: (body: object) => customFetch("/api/promotions", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Promotion created" });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promos-stats"] });
      setShowForm(false); setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to create", variant: "destructive" }),
  });

  const updatePromo = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/promotions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Promotion updated" });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promos-stats"] });
      setEditPromo(null);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Update failed", variant: "destructive" }),
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/promotions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promos-stats"] });
    },
  });

  const deletePromo = useMutation({
    mutationFn: (id: number) => customFetch(`/api/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Promotion deleted" });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promos-stats"] });
      setDeleteId(null);
    },
  });

  const openEdit = (p: Promotion) => {
    setEditPromo(p);
    setForm({
      name: p.name, description: p.description ?? "",
      type: p.type, value: p.value,
      buyQuantity: p.buyQuantity ? String(p.buyQuantity) : "",
      getQuantity: p.getQuantity ? String(p.getQuantity) : "",
      minOrderAmount: p.minOrderAmount ?? "",
      maxDiscountAmount: p.maxDiscountAmount ?? "",
      startDate: p.startDate, endDate: p.endDate,
      status: p.status, appliesTo: p.appliesTo,
      targetCategory: p.targetCategory ?? "",
      promoCode: p.promoCode ?? "", usageLimit: p.usageLimit ? String(p.usageLimit) : "",
    });
  };

  const buildBody = () => ({
    name: form.name.trim(), description: form.description || null,
    type: form.type, value: parseFloat(form.value || "0"),
    buyQuantity: form.buyQuantity ? parseInt(form.buyQuantity) : null,
    getQuantity: form.getQuantity ? parseInt(form.getQuantity) : null,
    minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : 0,
    maxDiscountAmount: form.maxDiscountAmount ? parseFloat(form.maxDiscountAmount) : null,
    startDate: form.startDate, endDate: form.endDate,
    status: form.status, appliesTo: form.appliesTo,
    targetCategory: form.targetCategory || null,
    promoCode: form.promoCode.trim().toUpperCase() || null,
    usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied to clipboard" });
  };

  const rows = data?.data ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / 50);

  /* ── Discount display helper ──────────────────────────── */
  const discountLabel = (p: Promotion) => {
    if (p.type === "percentage") return `${p.value}% off`;
    if (p.type === "fixed")      return `${GHS(Number(p.value))} off`;
    if (p.type === "buy_x_get_y") return `Buy ${p.buyQuantity ?? "?"} Get ${p.getQuantity ?? "?"}`;
    return p.value;
  };

  /* ── Usage bar ────────────────────────────────────────── */
  const UsageBar = ({ p }: { p: Promotion }) => {
    if (!p.usageLimit) return <span className="text-xs text-muted-foreground">{p.usageCount} uses</span>;
    const pct = Math.min((p.usageCount / p.usageLimit) * 100, 100);
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground">{p.usageCount}/{p.usageLimit}</span>
      </div>
    );
  };

  /* ── Form body ────────────────────────────────────────── */
  const FormBody = () => (
    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Promotion Name *</label>
        <Input className="h-8 text-xs" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Weekend Flash Sale" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Description</label>
        <Textarea className="text-xs" rows={2} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Brief description visible to cashiers…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Discount Type *</label>
          <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (% Off)</SelectItem>
              <SelectItem value="fixed">Fixed Amount Off</SelectItem>
              <SelectItem value="buy_x_get_y">Buy X Get Y Free</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            {form.type === "percentage" ? "Discount %" : form.type === "fixed" ? "Amount (GHS)" : "Buy Qty"}
          </label>
          {form.type === "buy_x_get_y" ? (
            <div className="flex gap-1">
              <Input className="h-8 text-xs" type="number" min="1" placeholder="Buy" value={form.buyQuantity}
                onChange={e => setForm(f => ({ ...f, buyQuantity: e.target.value }))} />
              <Input className="h-8 text-xs" type="number" min="1" placeholder="Get" value={form.getQuantity}
                onChange={e => setForm(f => ({ ...f, getQuantity: e.target.value }))} />
            </div>
          ) : (
            <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={form.type === "percentage" ? "e.g. 20" : "e.g. 5.00"} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Start Date *</label>
          <Input className="h-8 text-xs" type="date" value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">End Date *</label>
          <Input className="h-8 text-xs" type="date" value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Min Order (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={form.minOrderAmount}
            onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))}
            placeholder="0.00 = no minimum" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Max Discount (GHS)</label>
          <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={form.maxDiscountAmount}
            onChange={e => setForm(f => ({ ...f, maxDiscountAmount: e.target.value }))}
            placeholder="Leave blank = no cap" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Applies To</label>
          <Select value={form.appliesTo} onValueChange={v => setForm(f => ({ ...f, appliesTo: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              <SelectItem value="category">Specific Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.appliesTo === "category" && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Category Name</label>
            <Input className="h-8 text-xs" value={form.targetCategory}
              onChange={e => setForm(f => ({ ...f, targetCategory: e.target.value }))}
              placeholder="e.g. Beverages" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Promo Code</label>
          <Input className="h-8 text-xs uppercase" value={form.promoCode}
            onChange={e => setForm(f => ({ ...f, promoCode: e.target.value.toUpperCase() }))}
            placeholder="e.g. SAVE20 (optional)" maxLength={20} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Usage Limit</label>
          <Input className="h-8 text-xs" type="number" min="1" value={form.usageLimit}
            onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))}
            placeholder="Blank = unlimited" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
        <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  /* ── Stat card icons ──────────────────────────────────── */
  const statCards = [
    { label: "Active Now",  value: stats?.active ?? 0,   icon: CheckCircle2, color: "text-emerald-400", bg: "border-emerald-500/20 bg-emerald-500/5" },
    { label: "Upcoming",    value: stats?.upcoming ?? 0,  icon: Clock,        color: "text-blue-400",    bg: "border-blue-500/20 bg-blue-500/5" },
    { label: "Paused",      value: stats?.paused ?? 0,    icon: Pause,        color: "text-amber-400",   bg: "border-amber-500/20 bg-amber-500/5" },
    { label: "Total Uses",  value: stats?.totalUses ?? 0, icon: Tag,          color: "text-purple-400",  bg: "border-purple-500/20 bg-purple-500/5" },
  ];

  /* ── Tab counts ───────────────────────────────────────── */
  const tabCounts: Record<string, number> = {
    all:     (stats?.active ?? 0) + (stats?.paused ?? 0) + (stats?.draft ?? 0) + (stats?.expired ?? 0),
    active:  stats?.active  ?? 0,
    draft:   stats?.draft   ?? 0,
    paused:  stats?.paused  ?? 0,
    expired: stats?.expired ?? 0,
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Promotions & Discounts</h1>
            <p className="text-xs text-muted-foreground">Create and manage discount campaigns and promo codes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button size="sm" className="gap-1.5"
              onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }}>
              <Plus className="h-3.5 w-3.5" />New Promotion
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className={s.bg}>
            <CardContent className="pt-4 pb-3">
              <div className={`flex items-center gap-1.5 text-xs text-muted-foreground mb-1`}>
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />{s.label}
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top promotions by usage */}
      {(stats?.topByUsage?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Most Used Promotions</p>
            <div className="space-y-2">
              {(stats?.topByUsage ?? []).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-xs flex-1 truncate">{p.name}</span>
                  <span className="text-xs font-medium text-primary">{p.usageCount} uses</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Tabs value={tab} onValueChange={v => { setTab(v); setPage(1); }}>
          <TabsList className="h-8">
            {["all","active","draft","paused","expired"].map(t => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize px-3 h-7">
                {t} {tabCounts[t] > 0 && <span className="ml-1 text-[10px] opacity-60">({tabCounts[t]})</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2 sm:ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 text-xs pl-8 w-44" placeholder="Search name or code…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="percentage">% Off</SelectItem>
              <SelectItem value="fixed">Fixed Amount</SelectItem>
              <SelectItem value="buy_x_get_y">Buy X Get Y</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Promotion</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Discount</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Period</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Code</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Usage</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-xs w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-10">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                No promotions found
              </TableCell></TableRow>
            )}
            {rows.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-sm">{p.name}</div>
                  {p.description && (
                    <div className="text-[10px] text-muted-foreground truncate max-w-52">{p.description}</div>
                  )}
                  <span className="text-[10px] text-muted-foreground">{APPLIES_LABELS[p.appliesTo] ?? p.appliesTo}
                    {p.targetCategory && ` → ${p.targetCategory}`}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[p.type] ?? ""}`}>
                    {TYPE_LABELS[p.type] ?? p.type}
                  </span>
                </TableCell>
                <TableCell className="font-semibold text-sm text-emerald-400">
                  {discountLabel(p)}
                  {p.minOrderAmount && Number(p.minOrderAmount) > 0 && (
                    <div className="text-[10px] text-muted-foreground font-normal">
                      min {GHS(Number(p.minOrderAmount))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs hidden md:table-cell">
                  <div>{fmt(p.startDate)}</div>
                  <div className="text-muted-foreground">→ {fmt(p.endDate)}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {p.promoCode ? (
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{p.promoCode}</code>
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => copyCode(p.promoCode!)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <UsageBar p={p} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[p.status] ?? ""}`}>
                    {p.status}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      {p.status === "active" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-400"
                          title="Pause" onClick={() => patchStatus.mutate({ id: p.id, status: "paused" })}>
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {p.status === "paused" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400"
                          title="Resume" onClick={() => patchStatus.mutate({ id: p.id, status: "active" })}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {p.status === "draft" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400"
                          title="Activate" onClick={() => patchStatus.mutate({ id: p.id, status: "active" })}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} total
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Promotion</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              onClick={() => createPromo.mutate(buildBody())}
              disabled={createPromo.isPending || !form.name.trim() || !form.startDate || !form.endDate ||
                (form.type !== "buy_x_get_y" && !form.value)}>
              {createPromo.isPending ? "Saving…" : "Create Promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPromo} onOpenChange={open => !open && setEditPromo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Promotion</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPromo(null)}>Cancel</Button>
            <Button
              onClick={() => editPromo && updatePromo.mutate({ id: editPromo.id, body: buildBody() })}
              disabled={updatePromo.isPending || !form.name.trim()}>
              {updatePromo.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete promotion?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deletePromo.mutate(deleteId)}
              className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
