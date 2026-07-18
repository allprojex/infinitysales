/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions-context";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Undo2,
} from "lucide-react";

const reasons = [
  "Damaged",
  "Defective",
  "Expired",
  "Wrong item supplied",
  "Excess quantity",
  "Poor quality",
  "Supplier recall",
  "Order cancelled",
  "Other",
];
const conditions = ["Unopened", "Opened", "Damaged", "Defective", "Expired", "Unsellable", "Other"];
const settlementTypes = [
  "reduce_supplier_balance",
  "cash_refund",
  "bank_refund",
  "mobile_money_refund",
  "supplier_credit",
  "replacement_goods",
  "mixed_settlement",
  "no_immediate_settlement",
];
const GHS = (v: unknown) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(v ?? 0));
const title = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  reversed: "bg-purple-100 text-purple-800",
};

type PO = {
  id: string;
  reference: string;
  supplier_name?: string;
  supplierName?: string;
  warehouse_id?: string;
  total: number;
  received_date?: string;
  items?: any[];
};
type EligibleItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  quantityPreviouslyReturned: number;
  quantityReturnable: number;
  categoryName?: string;
};
type ReturnRow = {
  id: string;
  returnNumber: string;
  returnedAt: string;
  status: string;
  settlementType: string;
  totalAmount: number;
  outstandingAmount: number;
  itemCount: number;
  reasonSummary?: string;
  debitNoteNumber?: string;
  createdBy?: string;
  purchaseOrderId?: string;
  items?: any[];
  settlements?: any[];
  purchase?: any;
};

function Summary({ summary }: { summary: any }) {
  const cards = [
    ["Total Returns", summary?.total ?? 0],
    ["Draft", summary?.draft ?? 0],
    ["Pending Approval", summary?.pending_approval ?? 0],
    ["Completed", summary?.completed ?? 0],
    ["Return Value", GHS(summary?.value)],
    ["Refunds Received", GHS(summary?.refunded)],
    ["Outstanding", GHS(summary?.outstanding)],
  ];
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, value]) => (
        <Card key={String(label)}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NewReturn({
  open,
  onOpenChange,
  initialPurchaseId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPurchaseId?: string;
}) {
  const qc = useQueryClient(),
    { toast } = useToast();
  const [search, setSearch] = useState(""),
    [poId, setPoId] = useState(initialPurchaseId ?? ""),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [settlementType, setSettlementType] = useState("no_immediate_settlement");
  const [selected, setSelected] = useState<
    Record<
      string,
      { qty: number; reason: string; condition: string; notes: string; otherExplanation: string }
    >
  >({});
  const { data: pos } = useQuery<{ data: PO[] }>({
    queryKey: ["purchase-return-eligible", search],
    queryFn: () =>
      customFetch(`/api/purchase-returns/eligible?search=${encodeURIComponent(search)}`),
    enabled: open,
  });
  const { data: detail, isLoading } = useQuery<{ purchase: PO; items: EligibleItem[] }>({
    queryKey: ["purchase-return-po", poId],
    queryFn: () => customFetch(`/api/purchase-returns/eligible?purchaseOrderId=${poId}`),
    enabled: !!poId,
  });
  const mutation = useMutation({
    mutationFn: (submit: boolean) =>
      customFetch("/api/purchase-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: poId,
          warehouseId: detail?.purchase.warehouse_id,
          reasonSummary: reason,
          notes,
          settlementType,
          submit,
          items: Object.entries(selected).map(([productId, v]) => ({
            productId,
            quantityReturned: v.qty,
            reason: v.reason,
            condition: v.condition,
            notes: v.notes,
            otherExplanation: v.otherExplanation,
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Purchase return saved" });
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      onOpenChange(false);
      setPoId("");
      setSelected({});
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Could not save return", description: e.message }),
  });
  const update = (id: string, patch: Partial<(typeof selected)[string]>) =>
    setSelected((s) => ({
      ...s,
      [id]: {
        ...(s[id] ?? { qty: 0, reason: "", condition: "", notes: "", otherExplanation: "" }),
        ...patch,
      },
    }));
  const choose = (item: EligibleItem, checked: boolean) =>
    setSelected((s) => {
      const n = { ...s };
      if (checked)
        n[item.productId] = {
          qty: item.quantityReturnable,
          reason: "",
          condition: "",
          notes: "",
          otherExplanation: "",
        };
      else delete n[item.productId];
      return n;
    });
  const valid =
    poId &&
    Object.keys(selected).length > 0 &&
    Object.values(selected).every(
      (v) =>
        v.qty > 0 &&
        v.reason &&
        v.condition &&
        ((v.reason !== "Other" && v.condition !== "Other") || v.otherExplanation.trim()),
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Purchase Return</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Search received purchase</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Purchase number, supplier, invoice, product or date"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <Select
            value={poId}
            onValueChange={(v) => {
              setPoId(v);
              setSelected({});
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an eligible received purchase" />
            </SelectTrigger>
            <SelectContent>
              {pos?.data.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.reference} — {po.supplier_name ?? po.supplierName ?? "Supplier"} —{" "}
                  {GHS(po.total)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLoading && <Loader2 className="animate-spin" />}
          {detail && (
            <>
              <Card>
                <CardContent className="p-4 grid gap-2 md:grid-cols-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Purchase</span>
                    <p className="font-semibold">{detail.purchase.reference}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Supplier</span>
                    <p className="font-semibold">{detail.purchase.supplier_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Received</span>
                    <p>{detail.purchase.received_date ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total</span>
                    <p className="font-semibold">{GHS(detail.purchase.total)}</p>
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelected(
                      Object.fromEntries(
                        detail.items
                          .filter((i) => i.quantityReturnable > 0)
                          .map((i) => [
                            i.productId,
                            {
                              qty: i.quantityReturnable,
                              reason: "",
                              condition: "",
                              notes: "",
                              otherExplanation: "",
                            },
                          ]),
                      ),
                    )
                  }
                >
                  Return all eligible
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
                  Clear all
                </Button>
              </div>
              <div className="border rounded-xl overflow-x-auto">
                <Table className="min-w-[1050px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Purchased</TableHead>
                      <TableHead>Previously returned</TableHead>
                      <TableHead>Returnable</TableHead>
                      <TableHead>Return qty</TableHead>
                      <TableHead>Unit cost</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item) => {
                      const v = selected[item.productId];
                      return (
                        <TableRow
                          key={item.productId}
                          className={!item.quantityReturnable ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              disabled={!item.quantityReturnable}
                              checked={!!v}
                              onCheckedChange={(c) => choose(item, !!c)}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.quantityPreviouslyReturned}</TableCell>
                          <TableCell>{item.quantityReturnable}</TableCell>
                          <TableCell>
                            <Input
                              className="w-24"
                              type="number"
                              min="0.001"
                              max={item.quantityReturnable}
                              step="0.001"
                              disabled={!v}
                              value={v?.qty ?? ""}
                              onChange={(e) =>
                                update(item.productId, { qty: Number(e.target.value) })
                              }
                            />
                          </TableCell>
                          <TableCell>{GHS(item.unitCost)}</TableCell>
                          <TableCell>
                            <Select
                              disabled={!v}
                              value={v?.reason ?? ""}
                              onValueChange={(x) => update(item.productId, { reason: x })}
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue placeholder="Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {reasons.map((x) => (
                                  <SelectItem key={x} value={x}>
                                    {x}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              disabled={!v}
                              value={v?.condition ?? ""}
                              onValueChange={(x) => update(item.productId, { condition: x })}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue placeholder="Condition" />
                              </SelectTrigger>
                              <SelectContent>
                                {conditions.map((x) => (
                                  <SelectItem key={x} value={x}>
                                    {x}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{GHS((v?.qty ?? 0) * item.unitCost)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {Object.entries(selected).some(
                ([, v]) => v.reason === "Other" || v.condition === "Other",
              ) && (
                <div>
                  <Label>Other explanation *</Label>
                  <Textarea
                    placeholder="Explain the selected Other reason or condition"
                    onChange={(e) =>
                      setSelected(
                        (s) =>
                          Object.fromEntries(
                            Object.entries(s).map(([id, v]) => [
                              id,
                              v.reason === "Other" || v.condition === "Other"
                                ? { ...v, otherExplanation: e.target.value }
                                : v,
                            ]),
                          ) as typeof s,
                      )
                    }
                  />
                </div>
              )}
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>General reason</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason summary"
                  />
                </div>
                <div>
                  <Label>Settlement</Label>
                  <Select value={settlementType} onValueChange={setSettlementType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {settlementTypes.map((x) => (
                        <SelectItem key={x} value={x}>
                          {title(x)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid || mutation.isPending}
              variant="secondary"
              onClick={() => mutation.mutate(false)}
            >
              Save Draft
            </Button>
            <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate(true)}>
              <Send className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Details({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient(),
    { toast } = useToast(),
    { user } = useAuth();
  const { canAccess } = usePermissions();
  const [reason, setReason] = useState("");
  const [settlementType, setSettlementType] = useState("supplier_credit");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const { data: r, isLoading } = useQuery<ReturnRow>({
    queryKey: ["purchase-return", id],
    queryFn: () => customFetch(`/api/purchase-returns/${id}`),
    enabled: !!id,
  });
  const action = useMutation({
    mutationFn: (a: string) =>
      customFetch(`/api/purchase-returns/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: a, reason }),
      }),
    onSuccess: () => {
      toast({ title: "Return updated" });
      qc.invalidateQueries({ queryKey: ["purchase-return"] });
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      setReason("");
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Action failed", description: e.message }),
  });
  const settle = useMutation({
    mutationFn: () =>
      customFetch(`/api/purchase-returns/${id}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementType,
          amount: Number(settlementAmount),
          transactionReference: settlementReference,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Settlement recorded" });
      qc.invalidateQueries({ queryKey: ["purchase-return", id] });
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      setSettlementAmount("");
      setSettlementReference("");
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Settlement failed", description: e.message }),
  });
  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !r) return;
    w.document.write(
      `<html><head><title>${r.debitNoteNumber}</title><style>body{font-family:Arial;padding:32px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:20px}</style></head><body><h1>Infinity Techub</h1><h2>Debit Note ${r.debitNoteNumber ?? ""}</h2><p>Purchase Return: ${r.returnNumber}<br>Date: ${new Date(r.returnedAt).toLocaleDateString("en-GH")}<br>Original Purchase: ${r.purchase?.reference ?? ""}</p><table><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Reason</th><th>Total</th></tr>${(r.items ?? []).map((i) => `<tr><td>${i.productName}</td><td>${i.quantityReturned}</td><td>${GHS(i.unitCost)}</td><td>${i.reason}</td><td>${GHS(i.lineTotal)}</td></tr>`).join("")}</table><p class="total"><b>Total: ${GHS(r.totalAmount)}</b></p><p>Prepared by: ____________________ &nbsp; Approved by: ____________________</p></body></html>`,
    );
    w.document.close();
    w.print();
  };
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r?.returnNumber ?? "Purchase Return"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (
          r && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone[r.status]}>{title(r.status)}</Badge>
                <span className="text-sm text-muted-foreground">
                  Draft → Pending Approval → Approved → Completed
                </span>
                <div className="ml-auto flex gap-2">
                  {canAccess("perm_purchase_returns_print") && (
                    <Button variant="outline" size="sm" onClick={print}>
                      <Printer className="h-4 w-4 mr-1" />
                      Print / PDF
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Original purchase</p>
                    <p className="font-semibold">{r.purchase?.reference ?? "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Return date</p>
                    <p>{new Date(r.returnedAt).toLocaleDateString("en-GH")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Settlement</p>
                    <p>{title(r.settlementType)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold">{GHS(r.totalAmount)}</p>
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Purchased</TableHead>
                    <TableHead>Previously returned</TableHead>
                    <TableHead>Returned</TableHead>
                    <TableHead>Reason / condition</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.items?.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.productName}</TableCell>
                      <TableCell>{i.quantityPurchased}</TableCell>
                      <TableCell>{i.quantityPreviouslyReturned}</TableCell>
                      <TableCell>{i.quantityReturned}</TableCell>
                      <TableCell>
                        {i.reason} / {i.itemCondition}
                      </TableCell>
                      <TableCell className="text-right">{GHS(i.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {r.settlements?.length ? (
                <div>
                  <h3 className="font-semibold mb-2">Settlement history</h3>
                  {r.settlements.map((s) => (
                    <div key={s.id} className="flex justify-between border-b py-2 text-sm">
                      <span>
                        {title(s.settlementType)} — {s.transactionReference ?? "No reference"}
                      </span>
                      <b>{GHS(s.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : null}
              {r.status === "completed" &&
                Number(r.outstandingAmount) > 0 &&
                canAccess("perm_purchase_returns_settle", false) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Record settlement</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-4 gap-3">
                      <Select value={settlementType} onValueChange={setSettlementType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {settlementTypes
                            .filter((x) => x !== "mixed_settlement")
                            .map((x) => (
                              <SelectItem key={x} value={x}>
                                {title(x)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={r.outstandingAmount}
                        placeholder={`Amount (max ${r.outstandingAmount})`}
                        value={settlementAmount}
                        onChange={(e) => setSettlementAmount(e.target.value)}
                      />
                      <Input
                        placeholder="Transaction reference"
                        value={settlementReference}
                        onChange={(e) => setSettlementReference(e.target.value)}
                      />
                      <Button
                        disabled={
                          settle.isPending ||
                          Number(settlementAmount) <= 0 ||
                          Number(settlementAmount) > Number(r.outstandingAmount)
                        }
                        onClick={() => settle.mutate()}
                      >
                        {settle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Record Settlement
                      </Button>
                    </CardContent>
                  </Card>
                )}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {r.status === "draft" && (
                  <Button onClick={() => action.mutate("submit")}>
                    <Send className="h-4 w-4 mr-1" />
                    Submit
                  </Button>
                )}
                {r.status === "pending_approval" &&
                  r.createdBy !== user?.id &&
                  canAccess("perm_purchase_returns_approve", false) && (
                    <Button onClick={() => action.mutate("approve")}>
                      <ShieldCheck className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  )}
                {r.status === "pending_approval" && r.createdBy === user?.id && (
                  <p className="text-sm text-muted-foreground">
                    Awaiting approval from another authorized user.
                  </p>
                )}
                {r.status === "approved" && canAccess("perm_purchase_returns_complete", false) && (
                  <Button onClick={() => action.mutate("complete")}>
                    <Undo2 className="h-4 w-4 mr-1" />
                    Complete & Post Stock
                  </Button>
                )}
                {r.status === "completed" && user?.role === "admin" && (
                  <>
                    <Input
                      className="max-w-xs"
                      placeholder="Required reversal reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      variant="destructive"
                      disabled={reason.trim().length < 3}
                      onClick={() => action.mutate("reverse")}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reverse
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseReturns() {
  const initialPurchaseId =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("purchaseOrderId") ?? "");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [newOpen, setNewOpen] = useState(Boolean(initialPurchaseId)),
    [viewId, setViewId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const query = useMemo(
    () => `search=${encodeURIComponent(search)}&status=${status}&limit=100`,
    [search, status],
  );
  const { data, isLoading } = useQuery<{ data: ReturnRow[]; summary: any; total: number }>({
    queryKey: ["purchase-returns", query],
    queryFn: () => customFetch(`/api/purchase-returns?${query}`),
  });
  const exportCsv = () => {
    const rows = data?.data ?? [];
    const csv = [
      "Return Number,Date,Status,Settlement,Total,Outstanding,Items",
      ...rows.map((r) =>
        [
          r.returnNumber,
          r.returnedAt,
          r.status,
          r.settlementType,
          r.totalAmount,
          r.outstandingAmount,
          r.itemCount,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "purchase-returns.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchase Returns</h2>
          <p className="text-muted-foreground">
            Supplier returns, debit notes, settlements and stock posting.
          </p>
        </div>
        <div className="flex gap-2">
          {canAccess("perm_purchase_returns_export") && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          )}
          {canAccess("perm_purchase_returns_create") && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Purchase Return
            </Button>
          )}
        </div>
      </div>
      <Summary summary={data?.summary} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-56">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Return or purchase number, supplier reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {[
                  "draft",
                  "pending_approval",
                  "approved",
                  "completed",
                  "cancelled",
                  "reversed",
                ].map((x) => (
                  <SelectItem key={x} value={x}>
                    {title(x)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="animate-spin mx-auto" />
            </div>
          ) : !data?.data.length ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <h3 className="font-semibold mt-3">No purchase returns found</h3>
              <p className="text-sm text-muted-foreground">
                Create a return from an eligible received purchase.
              </p>
            </div>
          ) : (
            <Table className="min-w-[950px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Return</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Original Purchase</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-semibold text-primary">
                      {r.returnNumber}
                    </TableCell>
                    <TableCell>{new Date(r.returnedAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell>{r.purchaseOrderId?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell>{r.itemCount}</TableCell>
                    <TableCell className="font-semibold">{GHS(r.totalAmount)}</TableCell>
                    <TableCell>{title(r.settlementType)}</TableCell>
                    <TableCell>
                      <Badge className={statusTone[r.status]}>{title(r.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setViewId(r.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-right">{data?.total ?? 0} return(s)</p>
      <NewReturn open={newOpen} onOpenChange={setNewOpen} initialPurchaseId={initialPurchaseId} />
      <Details id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
