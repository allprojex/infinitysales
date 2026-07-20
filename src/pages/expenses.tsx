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
import { usePermissions } from "@/lib/permissions-context";
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  TrendingDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ── Constants ──────────────────────────────────────────── */
const CATEGORIES = [
  { value: "rent_lease", label: "Rent / Lease" },
  { value: "utilities", label: "Utilities" },
  { value: "staff_transport", label: "Staff Transport" },
  { value: "marketing", label: "Marketing" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "maintenance", label: "Maintenance" },
  { value: "security", label: "Security" },
  { value: "insurance", label: "Insurance" },
  { value: "communication", label: "Communication" },
  { value: "salaries", label: "Salaries" },
  { value: "taxes", label: "Taxes & Levies" },
  { value: "miscellaneous", label: "Miscellaneous" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  approved: "bg-blue-500/20  text-blue-300  border-blue-500/30",
  paid: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/20   text-red-300   border-red-500/30",
};

const CAT_COLORS: Record<string, string> = {
  rent_lease: "bg-purple-500/15 text-purple-300",
  utilities: "bg-blue-500/15 text-blue-300",
  staff_transport: "bg-sky-500/15 text-sky-300",
  marketing: "bg-pink-500/15 text-pink-300",
  office_supplies: "bg-orange-500/15 text-orange-300",
  maintenance: "bg-yellow-500/15 text-yellow-300",
  security: "bg-red-500/15 text-red-300",
  insurance: "bg-teal-500/15 text-teal-300",
  communication: "bg-cyan-500/15 text-cyan-300",
  salaries: "bg-green-500/15 text-green-300",
  taxes: "bg-rose-500/15 text-rose-300",
  miscellaneous: "bg-slate-500/15 text-slate-300",
  other: "bg-gray-500/15 text-gray-300",
};

const GHS = (v: number) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

/* ── Types ──────────────────────────────────────────────── */
interface Expense {
  id: number;
  title: string;
  category: string;
  categoryOther: string | null;
  amount: string;
  expenseDate: string;
  description: string | null;
  receiptNote: string | null;
  status: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}
interface ExpenseResp {
  data: Expense[];
  total: number;
  page: number;
  limit: number;
}
interface StatResp {
  thisMonth: { total: number; count: number };
  thisYear: { total: number; count: number };
  byCategory: { category: string; total: number; count: number }[];
  byStatus: { status: string; count: number; total: number }[];
}

const EMPTY_FORM = {
  title: "",
  category: "miscellaneous",
  categoryOther: "",
  amount: "",
  expenseDate: new Date().toISOString().split("T")[0],
  description: "",
  receiptNote: "",
  status: "pending",
};

/* ── Component ──────────────────────────────────────────── */
export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const canCreate = isAdmin || canAccess("perm_user_expenses_create", false);

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Queries ──────────────────────────────────────────── */
  const { data: stats, refetch: refetchStats } = useQuery<StatResp>({
    queryKey: ["expenses-stats"],
    queryFn: () => customFetch("/api/expenses/stats"),
  });

  const params = new URLSearchParams({ limit: "50", page: String(page) });
  if (filterCat !== "all") params.set("category", filterCat);
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (search) params.set("search", search);

  const { data, isLoading, refetch } = useQuery<ExpenseResp>({
    queryKey: ["expenses", filterCat, filterStatus, startDate, endDate, search, page],
    queryFn: () => customFetch(`/api/expenses?${params}`),
  });

  /* ── Mutations ────────────────────────────────────────── */
  const createExp = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/expenses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Expense recorded" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-stats"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast({ title: "Failed to create expense", variant: "destructive" }),
  });

  const updateExp = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Expense updated" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-stats"] });
      setEditExp(null);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteExp = useMutation({
    mutationFn: (id: number) => customFetch(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Expense deleted" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-stats"] });
      setDeleteId(null);
    },
  });

  const openEdit = (e: Expense) => {
    setEditExp(e);
    setForm({
      title: e.title,
      category: e.category,
      categoryOther: e.categoryOther ?? "",
      amount: e.amount,
      expenseDate: e.expenseDate,
      description: e.description ?? "",
      receiptNote: e.receiptNote ?? "",
      status: e.status,
    });
  };

  const buildBody = () => ({
    title: form.title,
    category: form.category,
    categoryOther: form.category === "other" ? form.categoryOther.trim() || null : null,
    amount: parseFloat(form.amount),
    expenseDate: form.expenseDate,
    description: form.description || null,
    receiptNote: form.receiptNote || null,
    status: form.status,
  });

  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  const totalPages = Math.ceil(((data as any)?.total ?? 0) / 50);

  /* ── Category breakdown bar ───────────────────────────── */
  const topCats = Array.isArray(stats?.byCategory) ? stats.byCategory.slice(0, 5) : [];
  const maxCatTotal = topCats[0]?.total ?? 1;

  /* ── Form ───────────────────────────────────────────────── */
  const FormBody = () => (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Title *</label>
        <Input
          className="h-8 text-xs"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Monthly Rent – Main Branch"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Category</label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.category === "other" && (
            <Input
              className="h-8 text-xs mt-2"
              value={form.categoryOther}
              onChange={(e) => setForm((f) => ({ ...f, categoryOther: e.target.value }))}
              placeholder="Specify the expense…"
            />
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Date *</label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Amount (GHS) *
          </label>
          <Input
            className="h-8 text-xs"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Description</label>
        <Textarea
          className="text-xs"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Additional details…"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">
          Receipt / Reference Note
        </label>
        <Input
          className="h-8 text-xs"
          value={form.receiptNote}
          onChange={(e) => setForm((f) => ({ ...f, receiptNote: e.target.value }))}
          placeholder="Invoice #, receipt number, or reference…"
        />
      </div>
    </div>
  );

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Expense Tracker</h1>
            <p className="text-xs text-muted-foreground">
              Track operating costs — rent, utilities, marketing and more
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              refetchStats();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canCreate && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setShowForm(true);
                setForm(EMPTY_FORM);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Expense
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-red-500/20 bg-red-500/5 col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              This Month
            </div>
            <p className="text-xl font-bold text-red-400">{GHS(stats?.thisMonth?.total ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">
              {stats?.thisMonth?.count ?? 0} expenses
            </p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-orange-500/5 col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              This Year
            </div>
            <p className="text-xl font-bold text-orange-400">{GHS(stats?.thisYear?.total ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">
              {stats?.thisYear?.count ?? 0} expenses
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pending</p>
            <p className="text-xl font-bold text-amber-400">
              {GHS(stats?.byStatus?.find((s) => s.status === "pending")?.total ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {stats?.byStatus?.find((s) => s.status === "pending")?.count ?? 0} awaiting
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Paid</p>
            <p className="text-xl font-bold text-emerald-400">
              {GHS(stats?.byStatus?.find((s) => s.status === "paid")?.total ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {stats?.byStatus?.find((s) => s.status === "paid")?.count ?? 0} settled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top categories bar chart */}
      {topCats.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Top Spending Categories (This Year)
            </p>
            <div className="space-y-2">
              {topCats.map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="text-xs w-32 shrink-0 truncate">{catLabel(c.category)}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${Math.round((c.total / maxCatTotal) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-right w-24 shrink-0 font-medium">
                    {GHS(c.total)}
                  </span>
                  <span className="text-[10px] text-muted-foreground w-12 shrink-0">
                    {c.count} txn{c.count !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search expenses…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={filterCat}
          onValueChange={(v) => {
            setFilterCat(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs w-32"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
          title="From date"
        />
        <Input
          className="h-8 text-xs w-32"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
          title="To date"
        />
        {(search || filterCat !== "all" || filterStatus !== "all" || startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setSearch("");
              setFilterCat("all");
              setFilterStatus("all");
              setStartDate("");
              setEndDate("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground flex items-center ml-auto">
          {data?.total ?? 0} results
        </span>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Title</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Reference</TableHead>
              {isAdmin && <TableHead className="text-xs">Created By</TableHead>}
              {isAdmin && <TableHead className="text-xs w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 6} className="text-center py-10">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 8 : 6}
                  className="text-center py-10 text-muted-foreground"
                >
                  No expenses found
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="font-medium text-sm">{e.title}</div>
                  {e.description && (
                    <div className="text-[10px] text-muted-foreground truncate max-w-48">
                      {e.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CAT_COLORS[e.category] ?? ""}`}
                  >
                    {e.category === "other" ? (e.categoryOther ?? "Other") : catLabel(e.category)}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(e.expenseDate).toLocaleDateString("en-GH", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right font-semibold text-sm text-red-400">
                  {GHS(Number(e.amount))}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${STATUS_COLORS[e.status] ?? ""}`}
                  >
                    {e.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                  {e.receiptNote ?? "—"}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-xs text-muted-foreground">
                    {e.createdByName ?? "—"}
                  </TableCell>
                )}
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(e.id)}
                      >
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
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Expense</DialogTitle>
          </DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createExp.mutate(buildBody())}
              disabled={
                createExp.isPending ||
                !form.title.trim() ||
                !form.amount ||
                !form.expenseDate ||
                (form.category === "other" && !form.categoryOther.trim())
              }
            >
              {createExp.isPending ? "Saving…" : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editExp} onOpenChange={(open) => !open && setEditExp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExp(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editExp && updateExp.mutate({ id: editExp.id, body: buildBody() })}
              disabled={
                updateExp.isPending ||
                !form.title.trim() ||
                !form.amount ||
                (form.category === "other" && !form.categoryOther.trim())
              }
            >
              {updateExp.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteExp.mutate(deleteId)}
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
