// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Landmark, Plus, Pencil, Trash2, RefreshCw, ArrowUpCircle,
  ArrowDownCircle, CheckCircle2, XCircle, Filter, X,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface BankAccount {
  id: number; name: string; bank_name: string; account_number: string;
  account_type: string; opening_balance: string; current_balance: string;
  currency: string; is_active: boolean; notes: string | null;
  txn_count: number; unreconciled_count: number;
  total_credits: string; total_debits: string;
  created_at: string;
}

interface BankTxn {
  id: number; account_id: number; txn_date: string; description: string;
  type: string; amount: string; balance_after: string;
  reference: string | null; reconciled: boolean; notes: string | null;
  created_by_name: string | null; created_at: string;
}

interface AccountDetail {
  account: BankAccount;
  transactions: BankTxn[];
  stats: {
    total_txns: number; reconciled_txns: number; unreconciled_txns: number;
    total_credits: string; total_debits: string;
  };
}

interface Summary {
  total_accounts: number; active_accounts: number;
  total_balance: string; unreconciled_txns: number;
}

/* ── Helpers ─────────────────────────────────────────────── */
const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });

const ACCOUNT_TYPES = [
  { value: "current",      label: "Current Account" },
  { value: "savings",      label: "Savings Account" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "other",        label: "Other" },
];

const emptyAcctForm = { name: "", bankName: "", accountNumber: "", accountType: "current", openingBalance: "0", currency: "GHS", notes: "" };
const emptyTxnForm  = { txnDate: new Date().toISOString().split("T")[0], description: "", type: "credit", amount: "", reference: "", notes: "" };

/* ── Component ──────────────────────────────────────────── */
export default function BankReconciliation() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selected,   setSelected]   = useState<number | null>(null);
  const [filterTab,  setFilterTab]  = useState("all"); // all | unreconciled | reconciled
  const [acctDlg,    setAcctDlg]    = useState(false);
  const [editAcct,   setEditAcct]   = useState<BankAccount | null>(null);
  const [txnDlg,     setTxnDlg]     = useState(false);
  const [delAcctDlg, setDelAcctDlg] = useState<BankAccount | null>(null);
  const [delTxnId,   setDelTxnId]   = useState<number | null>(null);
  const [acctForm,   setAcctForm]   = useState(emptyAcctForm);
  const [txnForm,    setTxnForm]    = useState(emptyTxnForm);

  /* ── Queries ──────────────────────────────────────────── */
  const { data: accountsResp, isLoading } = useQuery<BankAccount[] | { data: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: () => customFetch("/api/bank-accounts"),
    refetchInterval: 30_000,
  });
  const accounts: BankAccount[] = Array.isArray(accountsResp) ? accountsResp : (accountsResp?.data ?? []);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["bank-summary"],
    queryFn: () => customFetch("/api/bank-accounts/summary"),
    refetchInterval: 60_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<AccountDetail>({
    queryKey: ["bank-detail", selected],
    queryFn: () => customFetch(`/api/bank-accounts/${selected}`),
    enabled: !!selected,
    refetchInterval: 30_000,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const saveAcctMutation = useMutation({
    mutationFn: () => {
      const body = { ...acctForm, openingBalance: Number(acctForm.openingBalance) };
      return editAcct
        ? customFetch(`/api/bank-accounts/${editAcct.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : customFetch("/api/bank-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: (a: BankAccount) => {
      toast({ title: editAcct ? "Account updated" : "Account created" });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary"] });
      setAcctDlg(false);
      setSelected(a.id);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTxnMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/bank-accounts/${selected}/transactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...txnForm, amount: Number(txnForm.amount) }),
      }),
    onSuccess: () => {
      toast({ title: "Transaction recorded" });
      qc.invalidateQueries({ queryKey: ["bank-detail", selected] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary"] });
      setTxnDlg(false);
      setTxnForm(emptyTxnForm);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ txnId, reconciled }: { txnId: number; reconciled: boolean }) =>
      customFetch(`/api/bank-accounts/${selected}/transactions/${txnId}/reconcile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-detail", selected] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary"] });
    },
  });

  const delTxnMutation = useMutation({
    mutationFn: (txnId: number) =>
      customFetch(`/api/bank-accounts/${selected}/transactions/${txnId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Transaction deleted" });
      qc.invalidateQueries({ queryKey: ["bank-detail", selected] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setDelTxnId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delAcctMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/bank-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted" });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary"] });
      if (delAcctDlg?.id === selected) setSelected(null);
      setDelAcctDlg(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Derived ──────────────────────────────────────────── */
  const filteredTxns = (detail?.transactions ?? []).filter(t => {
    if (filterTab === "reconciled")   return t.reconciled;
    if (filterTab === "unreconciled") return !t.reconciled;
    return true;
  });

  const unreconciledBalance = detail
    ? (detail.transactions.filter(t => !t.reconciled)
        .reduce((s, t) => s + (t.type === "credit" ? Number(t.amount) : -Number(t.amount)), 0))
    : 0;

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-sidebar">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Bank Accounts</span>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1"
            onClick={() => { setEditAcct(null); setAcctForm(emptyAcctForm); setAcctDlg(true); }}>
            <Plus className="h-3 w-3" />New
          </Button>
        </div>

        {summary && (
          <div className="px-3 py-2 grid grid-cols-2 gap-1.5 border-b">
            <div className="rounded bg-muted/40 px-2 py-1">
              <p className="text-[10px] text-muted-foreground">Total Balance</p>
              <p className="text-xs font-bold text-primary">{ghc(summary.total_balance)}</p>
            </div>
            <div className="rounded bg-muted/40 px-2 py-1">
              <p className="text-[10px] text-muted-foreground">Unreconciled</p>
              <p className={`text-xs font-bold ${summary.unreconciled_txns > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                {summary.unreconciled_txns} txns
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && accounts.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No accounts yet</div>
          )}
          {accounts.map(a => (
            <button key={a.id} onClick={() => setSelected(a.id)}
              className={`w-full text-left rounded-lg p-2.5 transition-colors border ${a.id === selected ? "bg-primary/15 border-primary/30" : "hover:bg-muted/50 border-transparent"}`}>
              <div className="flex items-start gap-2">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${a.is_active ? "bg-primary/20" : "bg-muted"}`}>
                  <Landmark className={`h-3.5 w-3.5 ${a.is_active ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{a.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{a.bank_name}</p>
                  <p className="text-[11px] font-mono font-bold text-primary">{ghc(a.current_balance)}</p>
                  {a.unreconciled_count > 0 && (
                    <p className="text-[10px] text-amber-400">{a.unreconciled_count} unreconciled</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <Landmark className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Select a bank account or add one</p>
            <Button size="sm" onClick={() => { setEditAcct(null); setAcctForm(emptyAcctForm); setAcctDlg(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Bank Account
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
                  <h2 className="text-base font-bold">{detail.account.name}</h2>
                  <span className="text-xs text-muted-foreground">{detail.account.bank_name}</span>
                  <Badge variant="outline" className={`text-[10px] ${detail.account.is_active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                    {detail.account.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {detail.account.account_number} · {ACCOUNT_TYPES.find(t => t.value === detail.account.account_type)?.label}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { setTxnForm(emptyTxnForm); setTxnDlg(true); }}>
                  <Plus className="h-3.5 w-3.5" />Add Entry
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { setEditAcct(detail.account); setAcctForm({ name: detail.account.name, bankName: detail.account.bank_name, accountNumber: detail.account.account_number, accountType: detail.account.account_type, openingBalance: detail.account.opening_balance, currency: detail.account.currency, notes: detail.account.notes ?? "" }); setAcctDlg(true); }}>
                  <Pencil className="h-3.5 w-3.5" />Edit
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-red-400 hover:text-red-300"
                  onClick={() => setDelAcctDlg(detail.account)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b shrink-0">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Current Balance</p>
                  <p className="text-xl font-bold text-primary">{ghc(detail.account.current_balance)}</p>
                  <p className="text-[10px] text-muted-foreground">Opening: {ghc(detail.account.opening_balance)}</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total Credits</p>
                  <p className="text-xl font-bold text-emerald-400">{ghc(detail.stats.total_credits)}</p>
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Total Debits</p>
                  <p className="text-xl font-bold text-red-400">{ghc(detail.stats.total_debits)}</p>
                </CardContent>
              </Card>
              <Card className={detail.stats.unreconciled_txns > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-border"}>
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] text-muted-foreground">Reconciliation</p>
                  <p className="text-xl font-bold">
                    <span className="text-emerald-400">{detail.stats.reconciled_txns}</span>
                    <span className="text-muted-foreground text-base"> / {detail.stats.total_txns}</span>
                  </p>
                  {unreconciledBalance !== 0 && (
                    <p className={`text-[10px] ${unreconciledBalance > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {unreconciledBalance > 0 ? "+" : ""}{ghc(unreconciledBalance)} pending
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Filter tabs */}
            <div className="px-5 pt-2 pb-1 flex items-center justify-between shrink-0">
              <Tabs value={filterTab} onValueChange={setFilterTab}>
                <TabsList className="h-7">
                  <TabsTrigger value="all"           className="text-xs h-6">All ({detail.stats.total_txns})</TabsTrigger>
                  <TabsTrigger value="unreconciled"  className="text-xs h-6">
                    Unreconciled
                    {detail.stats.unreconciled_txns > 0 && <span className="ml-1 bg-amber-500 text-white rounded-full text-[9px] px-1">{detail.stats.unreconciled_txns}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="reconciled"    className="text-xs h-6">Reconciled ({detail.stats.reconciled_txns})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Transactions table */}
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="pl-5 w-10">✓</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right pr-5">Balance</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTxns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                        No transactions {filterTab !== "all" ? `in this filter` : "yet"}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredTxns.map(t => (
                    <TableRow key={t.id} className={`text-xs group ${t.reconciled ? "opacity-60" : ""}`}>
                      <TableCell className="pl-5">
                        <Checkbox checked={t.reconciled}
                          onCheckedChange={v => reconcileMutation.mutate({ txnId: t.id, reconciled: !!v })} />
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(t.txn_date)}</TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          {t.type === "credit"
                            ? <ArrowUpCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                            : <ArrowDownCircle className="h-3 w-3 text-red-400 shrink-0" />}
                          <span className="truncate" title={t.description}>{t.description}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[100px] truncate">{t.reference ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{t.created_by_name ?? "—"}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${t.type === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                        {t.type === "credit" ? "+" : "-"}{ghc(t.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono pr-5">{ghc(t.balance_after)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground"
                          onClick={() => setDelTxnId(t.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Add / Edit Account Dialog ── */}
      <Dialog open={acctDlg} onOpenChange={setAcctDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editAcct ? "Edit Account" : "Add Bank Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Account Label *</Label>
              <Input value={acctForm.name} onChange={e => setAcctForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Current Account" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bank Name *</Label>
              <Input value={acctForm.bankName} onChange={e => setAcctForm(f => ({ ...f, bankName: e.target.value }))} placeholder="GCB Bank, Ecobank…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account Number *</Label>
              <Input value={acctForm.accountNumber} onChange={e => setAcctForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account Type</Label>
              <Select value={acctForm.accountType} onValueChange={v => setAcctForm(f => ({ ...f, accountType: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!editAcct && (
              <div className="space-y-1.5">
                <Label className="text-xs">Opening Balance (₵)</Label>
                <Input type="number" min="0" step="0.01" value={acctForm.openingBalance}
                  onChange={e => setAcctForm(f => ({ ...f, openingBalance: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={acctForm.notes} onChange={e => setAcctForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctDlg(false)}>Cancel</Button>
            <Button onClick={() => saveAcctMutation.mutate()}
              disabled={!acctForm.name || !acctForm.bankName || !acctForm.accountNumber || saveAcctMutation.isPending}>
              {saveAcctMutation.isPending ? "Saving…" : editAcct ? "Update" : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Transaction Dialog ── */}
      <Dialog open={txnDlg} onOpenChange={setTxnDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Bank Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={txnForm.txnDate} onChange={e => setTxnForm(f => ({ ...f, txnDate: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type *</Label>
              <div className="flex gap-2">
                {["credit", "debit"].map(t => (
                  <button key={t} onClick={() => setTxnForm(f => ({ ...f, type: t }))}
                    className={`flex-1 rounded-lg border py-1.5 text-xs capitalize flex items-center justify-center gap-1.5 transition-colors ${txnForm.type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                    {t === "credit" ? <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-400" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-red-400" />}
                    {t === "credit" ? "Credit (Money In)" : "Debit (Money Out)"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description *</Label>
              <Input value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="Salary payment, Sales deposit…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₵) *</Label>
              <Input type="number" min="0.01" step="0.01" value={txnForm.amount}
                onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input value={txnForm.reference} onChange={e => setTxnForm(f => ({ ...f, reference: e.target.value }))} placeholder="Cheque #, transfer ref…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={txnForm.notes} onChange={e => setTxnForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnDlg(false)}>Cancel</Button>
            <Button onClick={() => addTxnMutation.mutate()}
              disabled={!txnForm.description || !txnForm.amount || Number(txnForm.amount) <= 0 || addTxnMutation.isPending}>
              {addTxnMutation.isPending ? "Adding…" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Confirm ── */}
      <AlertDialog open={!!delAcctDlg} onOpenChange={o => !o && setDelAcctDlg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Account</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{delAcctDlg?.name}</strong>? Accounts with transactions cannot be deleted — deactivate instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => delAcctDlg && delAcctMutation.mutate(delAcctDlg.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Transaction Confirm ── */}
      <AlertDialog open={!!delTxnId} onOpenChange={o => !o && setDelTxnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete this entry? The account balance will be recalculated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => delTxnId && delTxnMutation.mutate(delTxnId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}