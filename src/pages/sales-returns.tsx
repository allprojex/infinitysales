/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { usePermissions } from "@/lib/permissions-context";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Eye, Loader2, PackageOpen, Plus, RefreshCw, RotateCcw, Search, Undo2 } from "lucide-react";

const REFUND_METHODS = ["cash", "card", "mobile_money", "store_credit", "bank_transfer"];
const GHS = (v: unknown) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(v ?? 0));
const title = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statusTone: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  reversed: "bg-purple-100 text-purple-800",
};

type EligibleSale = {
  id: string;
  reference: string;
  soldAt: string;
  total: number;
  customerId?: string | null;
  customerName?: string | null;
};
type EligibleLine = {
  id: string;
  lineId: string;
  productId: string;
  productName: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  quantityAlreadyReturned: number;
  quantityReturnable: number;
};
type ReturnRow = {
  id: string;
  returnNumber: string;
  saleId: string;
  originalInvoice: string;
  customerName?: string | null;
  returnedAt: string;
  status: string;
  refundAmount: number;
  refundMethod: string;
  itemCount: number;
  createdByName?: string;
  reason?: string | null;
};

function Summary({ summary }: { summary: any }) {
  const cards = [
    ["Total Returns", summary?.total ?? 0],
    ["Pending Returns", summary?.pending ?? 0],
    ["Completed Returns", summary?.completed ?? 0],
    ["Refunded Amount", GHS(summary?.refunded)],
    ["Items Returned", summary?.itemsReturned ?? 0],
  ];
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
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

function NewReturn({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [searched, setSearched] = useState(false);
  const [sale, setSale] = useState<EligibleSale | null>(null);
  const [refundMethod, setRefundMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<
    Record<string, { qty: number; reason: string; condition: string }>
  >({});

  const results = useQuery<{ data: EligibleSale[] }>({
    queryKey: ["sales-returns-search", invoiceSearch],
    queryFn: () =>
      customFetch(`/api/sales-returns/eligible?search=${encodeURIComponent(invoiceSearch)}`),
    enabled: searched && !sale,
  });
  const filteredResults = (results.data?.data ?? []).filter((s) =>
    customerSearch
      ? (s.customerName ?? "").toLowerCase().includes(customerSearch.toLowerCase())
      : true,
  );

  const detail = useQuery<{ sale: EligibleSale; lines: EligibleLine[] }>({
    queryKey: ["sales-returns-sale", sale?.id],
    queryFn: () => customFetch(`/api/sales-returns/eligible?saleId=${sale?.id}`),
    enabled: !!sale,
  });

  const mutation = useMutation({
    mutationFn: () =>
      customFetch("/api/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale?.id,
          refundMethod,
          reason,
          notes,
          lines: Object.entries(selected).map(([saleLineId, v]) => ({
            saleLineId,
            quantityReturned: v.qty,
            reason: v.reason || undefined,
            condition: v.condition || undefined,
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Sales return recorded" });
      qc.invalidateQueries({ queryKey: ["sales-returns"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Could not save return", description: e.message }),
  });

  const reset = () => {
    setInvoiceSearch("");
    setCustomerSearch("");
    setSearched(false);
    setSale(null);
    setSelected({});
    setReason("");
    setNotes("");
    setRefundMethod("cash");
  };

  const update = (id: string, patch: Partial<(typeof selected)[string]>) =>
    setSelected((s) => ({
      ...s,
      [id]: { ...(s[id] ?? { qty: 0, reason: "", condition: "" }), ...patch },
    }));
  const toggle = (line: EligibleLine, checked: boolean) =>
    setSelected((s) => {
      const n = { ...s };
      if (checked) n[line.lineId] = { qty: line.quantityReturnable, reason: "", condition: "" };
      else delete n[line.lineId];
      return n;
    });

  const valid =
    sale && Object.keys(selected).length > 0 && Object.values(selected).every((v) => v.qty > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Return</DialogTitle>
        </DialogHeader>
        {!sale ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Invoice Number</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="e.g. INV-20260723111534"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Customer</Label>
                <Input
                  placeholder="Customer name"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={() => setSearched(true)} disabled={results.isFetching}>
              {results.isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
            {searched && !results.isFetching && (
              <div className="border rounded-xl overflow-hidden">
                {filteredResults.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No completed, return-eligible sale matched that search.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredResults.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono">{s.reference}</TableCell>
                          <TableCell>{s.customerName ?? "Walk-in"}</TableCell>
                          <TableCell>{new Date(s.soldAt).toLocaleDateString("en-GH")}</TableCell>
                          <TableCell>{GHS(s.total)}</TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => setSale(s)}>
                              Select
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 grid gap-2 md:grid-cols-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Invoice</span>
                  <p className="font-semibold">{sale.reference}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <p className="font-semibold">{sale.customerName ?? "Walk-in"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sold</span>
                  <p>{new Date(sale.soldAt).toLocaleDateString("en-GH")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total</span>
                  <p className="font-semibold">{GHS(sale.total)}</p>
                </div>
              </CardContent>
            </Card>
            <Button variant="ghost" size="sm" onClick={() => setSale(null)}>
              Search a different sale
            </Button>
            {detail.isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <div className="border rounded-xl overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Sold</TableHead>
                      <TableHead>Already returned</TableHead>
                      <TableHead>Returnable</TableHead>
                      <TableHead>Return qty</TableHead>
                      <TableHead>Unit price</TableHead>
                      <TableHead>Refund</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.data?.lines ?? []).map((line) => {
                      const v = selected[line.lineId];
                      return (
                        <TableRow
                          key={line.lineId}
                          className={!line.quantityReturnable ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              disabled={!line.quantityReturnable}
                              checked={!!v}
                              onChange={(e) => toggle(line, e.target.checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">{line.sku}</p>
                          </TableCell>
                          <TableCell>{line.quantity}</TableCell>
                          <TableCell>{line.quantityAlreadyReturned}</TableCell>
                          <TableCell>{line.quantityReturnable}</TableCell>
                          <TableCell>
                            <Input
                              className="w-24"
                              type="number"
                              min="0.001"
                              max={line.quantityReturnable}
                              step="0.001"
                              disabled={!v}
                              value={v?.qty ?? ""}
                              onChange={(e) => update(line.lineId, { qty: Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell>{GHS(line.unitPrice)}</TableCell>
                          <TableCell>{GHS(((v?.qty ?? 0) / line.quantity) * line.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Refund method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {title(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason summary"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Complete Return
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Details({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  const [reason, setReason] = useState("");
  const { data: r, isLoading } = useQuery<ReturnRow & { lines: any[] }>({
    queryKey: ["sales-return", id],
    queryFn: () => customFetch(`/api/sales-returns/${id}`),
    enabled: !!id,
  });
  const reverse = useMutation({
    mutationFn: () =>
      customFetch(`/api/sales-returns/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reverse", reason }),
      }),
    onSuccess: () => {
      toast({ title: "Return reversed" });
      qc.invalidateQueries({ queryKey: ["sales-return", id] });
      qc.invalidateQueries({ queryKey: ["sales-returns"] });
      setReason("");
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Reversal failed", description: e.message }),
  });
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r?.returnNumber ?? "Sales Return"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (
          r && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone[r.status]}>{title(r.status)}</Badge>
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Original invoice</p>
                    <p className="font-semibold">{r.originalInvoice}</p>
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
                    <p className="text-xs text-muted-foreground">Refund method</p>
                    <p>{title(r.refundMethod)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Refund amount</p>
                    <p className="font-bold">{GHS(r.refundAmount)}</p>
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty returned</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(r.lines ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.productName}</TableCell>
                      <TableCell>{l.quantityReturned}</TableCell>
                      <TableCell>{GHS(l.unitPrice)}</TableCell>
                      <TableCell className="text-right">{GHS(l.refundAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {r.status === "completed" && canAccess("perm_sales_returns_reverse", false) && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Input
                    className="max-w-xs"
                    placeholder="Required reversal reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    variant="destructive"
                    disabled={reason.trim().length < 3 || reverse.isPending}
                    onClick={() => reverse.mutate()}
                  >
                    {reverse.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Reverse
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SalesReturns() {
  const [returnNumber, setReturnNumber] = useState("");
  const [originalInvoice, setOriginalInvoice] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const { canAccess } = usePermissions();

  const { data: warehouses } = useQuery<{ data: { id: string; name: string }[] }>({
    queryKey: ["warehouses-lite"],
    queryFn: () => customFetch("/api/warehouses?limit=200"),
  });

  const buildQuery = () =>
    new URLSearchParams({
      ...(returnNumber ? { search: returnNumber } : {}),
      ...(originalInvoice ? { originalInvoice } : {}),
      ...(customer ? { customer } : {}),
      status,
      warehouseId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      limit: "100",
    }).toString();

  const query = useMemo(() => appliedQuery, [appliedQuery]);
  const { data, isLoading, refetch, isFetching } = useQuery<{
    data: ReturnRow[];
    summary: any;
    total: number;
  }>({
    queryKey: ["sales-returns", query],
    queryFn: () => customFetch(`/api/sales-returns?${query}`),
  });

  const search = () => setAppliedQuery(buildQuery());
  const resetFilters = () => {
    setReturnNumber("");
    setOriginalInvoice("");
    setCustomer("");
    setStatus("all");
    setWarehouseId("all");
    setFrom("");
    setTo("");
    setAppliedQuery("");
  };

  const recentActivity = (data?.data ?? []).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Returns</h2>
          <p className="text-muted-foreground">
            Manage customer returns, refunds, exchanges and inventory adjustments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <Search className="h-4 w-4 mr-2" />
            Search Sale
          </Button>
          {canAccess("perm_sales_returns_create") && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Return
            </Button>
          )}
        </div>
      </div>

      <Summary summary={data?.summary} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Input
                  placeholder="Return number"
                  value={returnNumber}
                  onChange={(e) => setReturnNumber(e.target.value)}
                />
                <Input
                  placeholder="Original invoice"
                  value={originalInvoice}
                  onChange={(e) => setOriginalInvoice(e.target.value)}
                />
                <Input
                  placeholder="Customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reversed">Reversed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All warehouses</SelectItem>
                    {warehouses?.data?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={search}>
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="animate-spin mx-auto" />
                </div>
              ) : !data?.data.length ? (
                <div className="p-12 text-center">
                  <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <h3 className="font-semibold mt-3">No sales returns have been created yet.</h3>
                  {canAccess("perm_sales_returns_create") && (
                    <Button className="mt-4" onClick={() => setNewOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Sales Return
                    </Button>
                  )}
                </div>
              ) : (
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No.</TableHead>
                      <TableHead>Original Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Return Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Refund Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-semibold text-primary">
                          {r.returnNumber}
                        </TableCell>
                        <TableCell className="font-mono">{r.originalInvoice}</TableCell>
                        <TableCell>{r.customerName ?? "Walk-in"}</TableCell>
                        <TableCell>{new Date(r.returnedAt).toLocaleDateString("en-GH")}</TableCell>
                        <TableCell>{r.itemCount}</TableCell>
                        <TableCell className="font-semibold">{GHS(r.refundAmount)}</TableCell>
                        <TableCell>
                          <Badge className={statusTone[r.status]}>{title(r.status)}</Badge>
                        </TableCell>
                        <TableCell>{r.createdByName ?? "—"}</TableCell>
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
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Undo2 className="h-4 w-4" />
              Recent Return Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              recentActivity.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left border-b pb-2 last:border-0 hover:bg-muted/50 rounded px-1 -mx-1"
                  onClick={() => setViewId(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{r.returnNumber}</span>
                    <Badge className={statusTone[r.status]}>{title(r.status)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.customerName ?? "Walk-in"} &middot; {GHS(r.refundAmount)} &middot;{" "}
                    {new Date(r.returnedAt).toLocaleDateString("en-GH")}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <NewReturn open={newOpen} onOpenChange={setNewOpen} />
      <Details id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
