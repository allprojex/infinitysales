import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Search, Plus, ArrowDownCircle, ArrowUpCircle,
  Settings2, RefreshCw, TrendingUp, Users, AlertCircle,
  CheckCircle2, XCircle, SlidersHorizontal,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface CreditAccount {
  id: number; customer_id: number;
  customer_name: string; customer_email: string;
  customer_phone: string | null; customer_company: string | null;
  credit_limit: string; outstanding: string;
  available_credit: string;
  total_borrowed: string; total_paid: string;
  status: string; notes: string | null;
  created_at: string; updated_at: string;
}

interface CreditSummary {
  total_accounts: number; active: number; suspended: number;
  total_outstanding: string; total_credit_limit: string;
  total_paid: string; accounts_with_balance: number;
}

interface CreditTransaction {
  id: number; type: string; amount: string;
  balance_after: string; reference: string | null;
  notes: string | null; created_by_name: string | null;
  created_at: string; sale_id: number | null;
}

interface CreditDetail {
  credit: {
    id: number; customer_id: number; credit_limit: string;
    outstanding: string; total_borrowed: string; total_paid: string;
    status: string; notes: string | null;
  };
  customer: { id: number; name: string; email: string; phone: string | null; company: string | null } | null;
  transactions: CreditTransaction[];
}

/* ── Constants ───────────────────────────────────────────── */
const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });

const statusBadge = (s: string) => {
  if (s === "active")    return <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-[10px]">Active</Badge>;
  if (s === "suspended") return <Badge variant="outline" className="text-amber-400 border-amber-500/40 text-[10px]">Suspended</Badge>;
  return <Badge variant="outline" className="text-muted-foreground text-[10px]">Closed</Badge>;
};

const txColor = (type: string) => {
  if (type === "charge")     return "text-red-400";
  if (type === "payment")    return "text-emerald-400";
  if (type === "refund")     return "text-blue-400";
  return "text-amber-400";
};
const txSign = (type: string) => (type === "charge" ? "+" : "-");

/* ── Main Component ─────────────────────────────────────── */
export default function CustomerCredits() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab,       setTab]       = useState("all");
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<number | null>(null); // customer_id

  // Dialog states
  const [setupDlg,   setSetupDlg]   = useState(false);
  const [payDlg,     setPayDlg]     = useState(false);
  const [chargeDlg,  setChargeDlg]  = useState(false);
  const [adjDlg,     setAdjDlg]     = useState(false);
  const [setupOpen,  setSetupOpen]  = useState(false); // "enable credit" dialog

  const [setupForm,  setSetupForm]  = useState({ creditLimit: "", status: "active", notes: "" });
  const [payForm,    setPayForm]    = useState({ amount: "", reference: "", notes: "" });
  const [chargeForm, setChargeForm] = useState({ amount: "", reference: "", notes: "" });
  const [adjForm,    setAdjForm]    = useState({ amount: "", notes: "" });
  const [newCustId,  setNewCustId]  = useState("");

  /* ── Queries ──────────────────────────────────────────── */
  const { data: summary } = useQuery<CreditSummary>({
    queryKey: ["credit-summary"],
    queryFn: () => customFetch("/api/customer-credits/summary"),
    refetchInterval: 60_000,
  });

  const statusFilter = tab === "all" ? "" : tab;
  const { data: accounts = [], isLoading } = useQuery<CreditAccount[]>({
    queryKey: ["customer-credits", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search)       params.set("search", search);
      return customFetch<any>(`/api/customer-credits?${params}`).then((d) => (Array.isArray(d) ? d : d?.data ?? []));
    },
    refetchInterval: 30_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<CreditDetail>({
    queryKey: ["credit-detail", selected],
    queryFn: () => customFetch(`/api/customer-credits/customer/${selected}`),
    enabled: !!selected,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const setupMutation = useMutation({
    mutationFn: (cid: number) =>
      customFetch(`/api/customer-credits/customer/${cid}/setup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimit: Number(setupForm.creditLimit), status: setupForm.status, notes: setupForm.notes }),
      }),
    onSuccess: () => {
      toast({ title: "Credit account updated" });
      qc.invalidateQueries({ queryKey: ["customer-credits"] });
      qc.invalidateQueries({ queryKey: ["credit-detail", selected] });
      qc.invalidateQueries({ queryKey: ["credit-summary"] });
      setSetupDlg(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const enableMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/customer-credits/customer/${Number(newCustId)}/setup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimit: Number(setupForm.creditLimit), status: "active", notes: setupForm.notes }),
      }),
    onSuccess: (credit: any) => {
      toast({ title: "Credit account enabled" });
      qc.invalidateQueries({ queryKey: ["customer-credits"] });
      qc.invalidateQueries({ queryKey: ["credit-summary"] });
      setSetupOpen(false);
      setSelected(credit.customer_id ?? Number(newCustId));
      setNewCustId("");
      setSetupForm({ creditLimit: "", status: "active", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/customer-credits/customer/${selected}/payment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payForm),
      }),
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: ["credit-detail", selected] });
      qc.invalidateQueries({ queryKey: ["customer-credits"] });
      qc.invalidateQueries({ queryKey: ["credit-summary"] });
      setPayDlg(false);
      setPayForm({ amount: "", reference: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const chargeMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/customer-credits/customer/${selected}/charge`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chargeForm),
      }),
    onSuccess: () => {
      toast({ title: "Charge recorded" });
      qc.invalidateQueries({ queryKey: ["credit-detail", selected] });
      qc.invalidateQueries({ queryKey: ["customer-credits"] });
      qc.invalidateQueries({ queryKey: ["credit-summary"] });
      setChargeDlg(false);
      setChargeForm({ amount: "", reference: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const adjMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/customer-credits/customer/${selected}/adjust`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adjForm),
      }),
    onSuccess: () => {
      toast({ title: "Adjustment saved" });
      qc.invalidateQueries({ queryKey: ["credit-detail", selected] });
      qc.invalidateQueries({ queryKey: ["customer-credits"] });
      qc.invalidateQueries({ queryKey: ["credit-summary"] });
      setAdjDlg(false);
      setAdjForm({ amount: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Derived ──────────────────────────────────────────── */
  const selAccount = accounts.find(a => a.customer_id === selected) ?? null;
  const outstanding = detail ? Number(detail.credit.outstanding) : 0;
  const creditLimit = detail ? Number(detail.credit.credit_limit) : 0;
  const available   = creditLimit > 0 ? creditLimit - outstanding : null;
  const utilPct     = creditLimit > 0 ? Math.min(100, (outstanding / creditLimit) * 100) : null;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-sidebar">
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Credit Accounts</span>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1"
            onClick={() => { setSetupForm({ creditLimit: "", status: "active", notes: "" }); setSetupOpen(true); }}>
            <Plus className="h-3 w-3" />Enable
          </Button>
        </div>

        {/* Summary pills */}
        {summary && (
          <div className="px-3 py-2 grid grid-cols-2 gap-1.5 border-b">
            <div className="rounded bg-muted/40 px-2 py-1">
              <p className="text-[10px] text-muted-foreground">Outstanding</p>
              <p className="text-xs font-bold text-red-400">{ghc(summary.total_outstanding)}</p>
            </div>
            <div className="rounded bg-muted/40 px-2 py-1">
              <p className="text-[10px] text-muted-foreground">Accounts</p>
              <p className="text-xs font-bold">{summary.accounts_with_balance} / {summary.total_accounts}</p>
            </div>
          </div>
        )}

        {/* Tabs + search */}
        <div className="px-2 pt-2 space-y-2">
          <Tabs value={tab} onValueChange={t => { setTab(t); setSelected(null); }}>
            <TabsList className="w-full h-7">
              <TabsTrigger value="all"       className="flex-1 text-xs h-6">All</TabsTrigger>
              <TabsTrigger value="active"    className="flex-1 text-xs h-6">Active</TabsTrigger>
              <TabsTrigger value="suspended" className="flex-1 text-xs h-6">Suspended</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs" />
          </div>
        </div>

        {/* Account list */}
        <div className="flex-1 overflow-y-auto p-2 mt-1 space-y-1">
          {isLoading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && accounts.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No accounts found</div>
          )}
          {accounts.map(a => {
            const owed = Number(a.outstanding);
            const lim  = Number(a.credit_limit);
            const pct  = lim > 0 ? Math.min(100, (owed / lim) * 100) : null;
            const isSelected = a.customer_id === selected;
            return (
              <button key={a.id} onClick={() => setSelected(a.customer_id)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors flex items-start gap-2 border ${isSelected ? "bg-primary/15 border-primary/30" : "hover:bg-muted/50 border-transparent"}`}>
                <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium truncate">{a.customer_name}</p>
                    {statusBadge(a.status)}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{a.customer_company ?? a.customer_email}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-[11px] font-mono font-semibold ${owed > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {ghc(owed)} owed
                    </p>
                    {lim > 0 && <p className="text-[10px] text-muted-foreground">/ {ghc(lim)}</p>}
                  </div>
                  {pct !== null && (
                    <div className="mt-1 h-1 rounded bg-muted overflow-hidden">
                      <div className={`h-full rounded transition-all ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <CreditCard className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Select a credit account or enable one for a customer</p>
            <Button size="sm" onClick={() => { setSetupForm({ creditLimit: "", status: "active", notes: "" }); setSetupOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />Enable Credit Account
            </Button>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="border-b px-5 py-3 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">{detail.customer?.name ?? "—"}</h2>
                  {statusBadge(detail.credit.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail.customer?.email}
                  {detail.customer?.company ? ` · ${detail.customer.company}` : ""}
                  {detail.customer?.phone ? ` · ${detail.customer.phone}` : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { setChargeDlg(true); setChargeForm({ amount: "", reference: "", notes: "" }); }}>
                  <ArrowUpCircle className="h-3.5 w-3.5 text-red-400" />Charge
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { setPayDlg(true); setPayForm({ amount: "", reference: "", notes: "" }); }}>
                  <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-400" />Record Payment
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => {
                    setSetupForm({ creditLimit: detail.credit.credit_limit, status: detail.credit.status, notes: detail.credit.notes ?? "" });
                    setSetupDlg(true);
                  }}>
                  <Settings2 className="h-3.5 w-3.5" />Settings
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b shrink-0">
              <Card className={`border-${outstanding > 0 ? "red" : "border"}-500/20 bg-${outstanding > 0 ? "red" : "muted"}/5`}>
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Outstanding</p>
                  <p className={`text-xl font-bold ${outstanding > 0 ? "text-red-400" : "text-muted-foreground"}`}>{ghc(outstanding)}</p>
                  {utilPct !== null && (
                    <p className="text-[10px] text-muted-foreground">{utilPct.toFixed(0)}% of limit used</p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Credit Limit</p>
                  <p className="text-xl font-bold">{creditLimit > 0 ? ghc(creditLimit) : "—"}</p>
                  {available !== null && <p className="text-[10px] text-emerald-400">{ghc(available)} available</p>}
                </CardContent>
              </Card>
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total Paid</p>
                  <p className="text-xl font-bold text-emerald-400">{ghc(detail.credit.total_paid)}</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total Borrowed</p>
                  <p className="text-xl font-bold">{ghc(detail.credit.total_borrowed)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Utilisation bar */}
            {utilPct !== null && (
              <div className="px-5 py-2 shrink-0 border-b">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Credit utilisation</span>
                  <span>{utilPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className={`h-full rounded transition-all ${utilPct > 80 ? "bg-red-500" : utilPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${utilPct}%` }} />
                </div>
                {utilPct > 80 && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />High utilisation — consider reviewing credit limit
                  </p>
                )}
              </div>
            )}

            {/* Transaction log */}
            <div className="px-5 pt-2 pb-1 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">Transaction Ledger</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground"
                onClick={() => { setAdjDlg(true); setAdjForm({ amount: "", notes: "" }); }}>
                <SlidersHorizontal className="h-3 w-3" />Adjust
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="pl-5">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right pr-5">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  )}
                  {detail.transactions.map(t => (
                    <TableRow key={t.id} className="text-xs">
                      <TableCell className="pl-5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.created_at)} {fmtTime(t.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className={`capitalize font-medium text-[11px] ${txColor(t.type)}`}>
                          {t.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[120px] truncate">
                        <span title={t.reference ?? t.notes ?? "—"}>
                          {t.reference ?? (t.notes ? t.notes.slice(0, 30) : "—")}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.created_by_name ?? "—"}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${txColor(t.type)}`}>
                        {txSign(t.type)}{ghc(Math.abs(Number(t.amount)))}
                      </TableCell>
                      <TableCell className="text-right font-mono pr-5">
                        {ghc(t.balance_after)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Enable Credit Dialog ── */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enable Credit Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer ID *</Label>
              <Input type="number" min="1" placeholder="Enter customer ID"
                value={newCustId} onChange={e => setNewCustId(e.target.value)} autoFocus />
              <p className="text-[10px] text-muted-foreground">You can find the customer ID on the Customers page.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Credit Limit (₵)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0 = unlimited"
                value={setupForm.creditLimit} onChange={e => setSetupForm(f => ({ ...f, creditLimit: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Set 0 for no limit.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={setupForm.notes} onChange={e => setSetupForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button>
            <Button onClick={() => enableMutation.mutate()}
              disabled={!newCustId || enableMutation.isPending}>
              {enableMutation.isPending ? "Enabling…" : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Settings Dialog ── */}
      <Dialog open={setupDlg} onOpenChange={setSetupDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Credit Account Settings</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Credit Limit (₵)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0 = unlimited"
                value={setupForm.creditLimit} onChange={e => setSetupForm(f => ({ ...f, creditLimit: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="flex gap-2">
                {["active", "suspended", "closed"].map(s => (
                  <button key={s} onClick={() => setSetupForm(f => ({ ...f, status: s }))}
                    className={`flex-1 rounded-lg border py-1.5 text-xs capitalize transition-colors ${setupForm.status === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={setupForm.notes} onChange={e => setSetupForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDlg(false)}>Cancel</Button>
            <Button onClick={() => setupMutation.mutate(selected!)} disabled={setupMutation.isPending}>
              {setupMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment ── */}
      <Dialog open={payDlg} onOpenChange={setPayDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {detail && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs mb-2 flex justify-between">
              <span className="text-muted-foreground">Current balance</span>
              <span className="font-semibold text-red-400">{ghc(detail.credit.outstanding)}</span>
            </div>
          )}
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount Paid (₵) *</Label>
              <Input type="number" min="0.01" step="0.01"
                value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt #, cheque #, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDlg(false)}>Cancel</Button>
            <Button onClick={() => payMutation.mutate()}
              disabled={!payForm.amount || Number(payForm.amount) <= 0 || payMutation.isPending}>
              {payMutation.isPending ? "Recording…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Charge ── */}
      <Dialog open={chargeDlg} onOpenChange={setChargeDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Charge to Account</DialogTitle></DialogHeader>
          {detail && creditLimit > 0 && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs mb-2 flex justify-between">
              <span className="text-muted-foreground">Available credit</span>
              <span className="font-semibold text-emerald-400">{available !== null ? ghc(available) : "—"}</span>
            </div>
          )}
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₵) *</Label>
              <Input type="number" min="0.01" step="0.01"
                value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference / Invoice</Label>
              <Input value={chargeForm.reference} onChange={e => setChargeForm(f => ({ ...f, reference: e.target.value }))} placeholder="Invoice #, order #, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={chargeForm.notes} onChange={e => setChargeForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeDlg(false)}>Cancel</Button>
            <Button onClick={() => chargeMutation.mutate()}
              disabled={!chargeForm.amount || Number(chargeForm.amount) <= 0 || chargeMutation.isPending}>
              {chargeMutation.isPending ? "Charging…" : "Charge Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Adjustment ── */}
      <Dialog open={adjDlg} onOpenChange={setAdjDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Balance Adjustment</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1 mb-2">Enter a positive number to increase the balance, negative to reduce it.</p>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Adjustment Amount (₵)</Label>
              <Input type="number" step="0.01"
                value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Textarea value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjDlg(false)}>Cancel</Button>
            <Button onClick={() => adjMutation.mutate()}
              disabled={!adjForm.amount || Number(adjForm.amount) === 0 || !adjForm.notes || adjMutation.isPending}>
              {adjMutation.isPending ? "Saving…" : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
