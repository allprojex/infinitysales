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
  Banknote,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  X,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lock,
  ChevronRight,
  Receipt,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface CashSession {
  id: number;
  cashier_id: number | null;
  cashier_name: string;
  terminal: string;
  status: string;
  opening_amount: string;
  closing_amount: string | null;
  expected_amount: string | null;
  difference: string | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  movement_count: number;
  total_in: string;
  total_out: string;
}

interface CashMovement {
  id: number;
  session_id: number;
  type: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

interface SessionDetail extends CashSession {
  movements: CashMovement[];
  expected: number;
  totalIn: number;
  totalOut: number;
}

/* ── Constants ───────────────────────────────────────────── */
const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MOVEMENT_TYPES = [
  { value: "cash_in", label: "Cash In", icon: ArrowUpCircle, color: "text-emerald-400" },
  { value: "cash_out", label: "Cash Out", icon: ArrowDownCircle, color: "text-red-400" },
  { value: "payout", label: "Payout / Expense", icon: Banknote, color: "text-amber-400" },
  { value: "refund", label: "Refund", icon: Receipt, color: "text-orange-400" },
];

const movSign = (m: CashMovement) =>
  ["cash_in", "sale", "float_adjustment"].includes(m.type) && Number(m.amount) > 0 ? "+" : "-";
const movColor = (m: CashMovement) =>
  ["cash_in", "sale"].includes(m.type) ? "text-emerald-400" : "text-red-400";

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });

/* ── Component ──────────────────────────────────────────── */
export default function CashManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("active");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Open drawer dialog
  const [openDrawerDlg, setOpenDrawerDlg] = useState(false);
  const [openForm, setOpenForm] = useState({
    openingAmount: "",
    terminal: "Main Register",
    notes: "",
  });

  // Add movement dialog
  const [movDlg, setMovDlg] = useState(false);
  const [movForm, setMovForm] = useState({ type: "cash_in", amount: "", reference: "", notes: "" });

  // Close dialog
  const [closeDlg, setCloseDlg] = useState(false);
  const [closeForm, setCloseForm] = useState({ closingAmount: "", notes: "" });

  /* ── Queries ──────────────────────────────────────────── */
  // /api/cash-sessions/active returns a single object or null — normalize to array.
  const { data: activeSessions = [], isLoading: activeLoading } = useQuery<CashSession[]>({
    queryKey: ["cash-sessions", "active"],
    queryFn: () =>
      customFetch<any>("/api/cash-sessions/active").then((d) =>
        Array.isArray(d) ? d : d ? [d] : [],
      ),
    refetchInterval: 30_000,
  });

  const { data: allSessions = [], isLoading: allLoading } = useQuery<CashSession[]>({
    queryKey: ["cash-sessions", "all"],
    queryFn: () =>
      customFetch<any>("/api/cash-sessions?limit=50").then((d) =>
        Array.isArray(d) ? d : (d?.data ?? []),
      ),
    enabled: tab === "history",
    refetchInterval: 60_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<SessionDetail>({
    queryKey: ["cash-session-detail", selectedId],
    queryFn: () => customFetch(`/api/cash-sessions/${selectedId}`),
    enabled: !!selectedId,
    refetchInterval: 30_000,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const openMutation = useMutation({
    mutationFn: (data: typeof openForm) =>
      customFetch("/api/cash-sessions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingAmount: Number(data.openingAmount),
          terminal: data.terminal,
          notes: data.notes,
        }),
      }),
    onSuccess: (session: CashSession) => {
      toast({ title: "Cash drawer opened", description: `Terminal: ${session.terminal}` });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      setOpenDrawerDlg(false);
      setSelectedId(session.id);
      setTab("active");
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMovMutation = useMutation({
    mutationFn: (data: typeof movForm) =>
      customFetch(`/api/cash-sessions/${selectedId}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.type,
          amount: Number(data.amount),
          reference: data.reference,
          notes: data.notes,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Movement recorded" });
      qc.invalidateQueries({ queryKey: ["cash-session-detail", selectedId] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      setMovDlg(false);
      setMovForm({ type: "cash_in", amount: "", reference: "", notes: "" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: (data: typeof closeForm) =>
      customFetch(`/api/cash-sessions/${selectedId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingAmount: Number(data.closingAmount), notes: data.notes }),
      }),
    onSuccess: () => {
      toast({ title: "Session closed successfully" });
      qc.invalidateQueries({ queryKey: ["cash-session-detail", selectedId] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      setCloseDlg(false);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMovMutation = useMutation({
    mutationFn: (movId: number) =>
      customFetch(`/api/cash-sessions/${selectedId}/movements/${movId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-session-detail", selectedId] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
    },
  });

  /* ── Derived ──────────────────────────────────────────── */
  const sessions = tab === "active" ? activeSessions : allSessions;
  const sessLoading = tab === "active" ? activeLoading : allLoading;
  const selectedSess = sessions.find((s) => s.id === selectedId) ?? null;
  const currentBalance = detail
    ? Number(detail.openingAmount) + Number(detail.totalIn) - Number(detail.totalOut)
    : null;
  const diff =
    detail?.status === "closed" && detail.difference != null ? Number(detail.difference) : null;

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: sessions list ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-sidebar">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-sidebar-foreground">Cash Sessions</span>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setOpenForm({ openingAmount: "", terminal: "Main Register", notes: "" });
              setOpenDrawerDlg(true);
            }}
          >
            <Plus className="h-3 w-3" />
            Open
          </Button>
        </div>

        <div className="px-2 pt-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full h-7">
              <TabsTrigger value="active" className="flex-1 text-xs h-6">
                Active{" "}
                {activeSessions.length > 0 && (
                  <span className="ml-1 bg-emerald-500 text-white rounded-full text-[9px] px-1">
                    {activeSessions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 text-xs h-6">
                History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 mt-1">
          {sessLoading && (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!sessLoading && sessions.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {tab === "active" ? "No open sessions" : "No sessions yet"}
            </div>
          )}
          {sessions.map((s) => {
            const isOpen = s.status === "open";
            const isSelected = s.id === selectedId;
            const bal = Number(s.opening_amount) + Number(s.total_in) - Number(s.total_out);
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors flex items-start gap-2 group ${isSelected ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/50 border border-transparent"}`}
              >
                <div
                  className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? "bg-emerald-500/20" : "bg-muted"}`}
                >
                  {isOpen ? (
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{s.terminal}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{s.cashier_name}</p>
                  <p className="text-[10px] font-mono text-primary">{ghc(bal)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtTime(s.opened_at)} · {fmtDate(s.opened_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: session detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSess && !selectedId ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <Banknote className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              Select a session or open a new cash drawer
            </p>
            <Button
              size="sm"
              onClick={() => {
                setOpenForm({ openingAmount: "", terminal: "Main Register", notes: "" });
                setOpenDrawerDlg(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Open Cash Drawer
            </Button>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="border-b px-5 py-3 flex items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">{detail.terminal}</h2>
                  <Badge
                    variant="outline"
                    className={
                      detail.status === "open"
                        ? "text-emerald-400 border-emerald-500/40 text-[10px]"
                        : "text-muted-foreground text-[10px]"
                    }
                  >
                    {detail.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail.cashier_name} · Opened {fmtTime(detail.opened_at)},{" "}
                  {fmtDate(detail.opened_at)}
                  {detail.closed_at && ` · Closed ${fmtTime(detail.closed_at)}`}
                </p>
              </div>
              {detail.status === "open" && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setMovForm({ type: "cash_in", amount: "", reference: "", notes: "" });
                      setMovDlg(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Movement
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1.5"
                    onClick={() => {
                      setCloseForm({ closingAmount: currentBalance?.toFixed(2) ?? "0", notes: "" });
                      setCloseDlg(true);
                    }}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Close Drawer
                  </Button>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b shrink-0">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Current Balance</p>
                  <p className="text-xl font-bold text-primary">{ghc(currentBalance ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Opening: {ghc(detail.openingAmount)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total In</p>
                  <p className="text-xl font-bold text-emerald-400">{ghc(detail.totalIn)}</p>
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total Out</p>
                  <p className="text-xl font-bold text-red-400">{ghc(detail.totalOut)}</p>
                </CardContent>
              </Card>
              <Card
                className={
                  diff !== null
                    ? Math.abs(diff) < 1
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : diff > 0
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    : "border-border"
                }
              >
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">
                    {detail.status === "closed" ? "Variance" : "Movements"}
                  </p>
                  {detail.status === "closed" && diff !== null ? (
                    <>
                      <p
                        className={`text-xl font-bold ${Math.abs(diff) < 1 ? "text-emerald-400" : diff > 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {diff > 0 ? "+" : ""}
                        {ghc(diff)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Expected: {ghc(detail.expectedAmount ?? 0)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold">{detail.movement_count}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Variance banner for closed sessions */}
            {detail.status === "closed" && diff !== null && Math.abs(diff) >= 1 && (
              <div
                className={`mx-5 mt-3 rounded-lg px-3 py-2 flex items-center gap-2 text-xs shrink-0 ${diff < 0 ? "bg-red-500/10 border border-red-500/30 text-red-400" : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"}`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {diff < 0
                  ? `Cash shortage of ${ghc(Math.abs(diff))} — drawer came up short vs expected`
                  : `Cash surplus of ${ghc(diff)} — drawer had more than expected`}
              </div>
            )}

            {/* Movements table */}
            <div className="flex-1 overflow-auto">
              <div className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                Movement Log
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="pl-5">Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.movements.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8 text-sm"
                      >
                        No movements recorded
                      </TableCell>
                    </TableRow>
                  )}
                  {detail.movements.map((m) => {
                    const isOpening =
                      m.type === "float_adjustment" && m.reference === "Opening float";
                    const sign = movSign(m);
                    const color = movColor(m);
                    return (
                      <TableRow key={m.id} className="text-xs group">
                        <TableCell className="pl-5 text-muted-foreground">
                          {fmtTime(m.created_at)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`capitalize text-[10px] font-medium ${isOpening ? "text-blue-400" : color}`}
                          >
                            {m.type.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[120px] truncate">
                          <span title={m.reference ?? "—"}>
                            {m.reference || (m.notes ? m.notes.slice(0, 30) : "—")}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(m as any).created_by_name ?? "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-medium ${isOpening ? "text-blue-400" : color}`}
                        >
                          {sign}
                          {ghc(Math.abs(Number(m.amount)))}
                        </TableCell>
                        <TableCell>
                          {!isOpening && detail.status === "open" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground"
                              onClick={() => delMovMutation.mutate(m.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Open Drawer Dialog ── */}
      <Dialog open={openDrawerDlg} onOpenChange={setOpenDrawerDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Open Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Opening Float (₵) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={openForm.openingAmount}
                onChange={(e) => setOpenForm((f) => ({ ...f, openingAmount: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Terminal / Register</Label>
              <Input
                value={openForm.terminal}
                onChange={(e) => setOpenForm((f) => ({ ...f, terminal: e.target.value }))}
                placeholder="Main Register"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={openForm.notes}
                onChange={(e) => setOpenForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDrawerDlg(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => openMutation.mutate(openForm)}
              disabled={!openForm.openingAmount || openMutation.isPending}
            >
              {openMutation.isPending ? "Opening…" : "Open Drawer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Movement Dialog ── */}
      <Dialog open={movDlg} onOpenChange={setMovDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Cash Movement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Type *</Label>
              <Select
                value={movForm.type}
                onValueChange={(v) => setMovForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₵) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={movForm.amount}
                onChange={(e) => setMovForm((f) => ({ ...f, amount: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input
                value={movForm.reference}
                onChange={(e) => setMovForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Invoice #, reason, etc."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={movForm.notes}
                onChange={(e) => setMovForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDlg(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addMovMutation.mutate(movForm)}
              disabled={!movForm.amount || Number(movForm.amount) <= 0 || addMovMutation.isPending}
            >
              {addMovMutation.isPending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close Drawer Dialog ── */}
      <Dialog open={closeDlg} onOpenChange={setCloseDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Cash Drawer</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 mb-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening float</span>
                <span>{ghc(detail.openingAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total cash in</span>
                <span className="text-emerald-400">+{ghc(detail.totalIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total cash out</span>
                <span className="text-red-400">-{ghc(detail.totalOut)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Expected balance</span>
                <span>{ghc(currentBalance ?? 0)}</span>
              </div>
            </div>
          )}
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Actual Cash Counted (₵) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={closeForm.closingAmount}
                onChange={(e) => setCloseForm((f) => ({ ...f, closingAmount: e.target.value }))}
                autoFocus
              />
              {closeForm.closingAmount && currentBalance !== null && (
                <p
                  className={`text-[10px] ${Math.abs(Number(closeForm.closingAmount) - currentBalance) < 0.01 ? "text-emerald-400" : Number(closeForm.closingAmount) < currentBalance ? "text-red-400" : "text-amber-400"}`}
                >
                  Variance: {(Number(closeForm.closingAmount) - currentBalance).toFixed(2)} (
                  {Number(closeForm.closingAmount) < currentBalance
                    ? "shortage"
                    : Number(closeForm.closingAmount) > currentBalance
                      ? "surplus"
                      : "balanced"}
                  )
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={closeForm.notes}
                onChange={(e) => setCloseForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDlg(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => closeMutation.mutate(closeForm)}
              disabled={!closeForm.closingAmount || closeMutation.isPending}
            >
              {closeMutation.isPending ? "Closing…" : "Close Drawer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
