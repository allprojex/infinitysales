import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Percent, Settings2, RefreshCw, Receipt, TrendingUp, ArrowRight } from "lucide-react";

/* ── Types ─────────────────────────────── */
interface Rates { vatRate: number; nhilRate: number; getfundRate: number; covidLevy: number; totalTaxRate: number; }
interface Summary { totalSales: number; grossRevenue: number; taxExclusive: number; vatAmount: number; nhilAmount: number; getfundAmount: number; covidLevyAmount: number; totalTaxCollected: number; taxCollectedSystem: number; }
interface VATReport {
  startDate: string; endDate: string; rates: Rates; summary: Summary;
  monthly: { month: string; month_key: string; sales_count: number; gross: string; exclusive: string; vat: string; nhil: string; getfund: string; }[];
  byMethod: { method: string; sales_count: number; gross: string; vat: string; }[];
  sales: { id: number; invoice_number: string; sale_date: string; gross: string; exclusive: string; vat: string; nhil: string; getfund: string; customer_name: string; payment_method: string | null; }[];
}

/* ── Helpers ─────────────────────────────── */
const ghc = (v: number | string) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
const pct = (n: number) => `${n}%`;

const thisYear = new Date().getFullYear();
const defaultStart = `${thisYear}-01-01`;
const defaultEnd   = new Date().toISOString().split("T")[0];

/* ── Component ───────────────────────────── */
export default function VATReport() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(defaultEnd);
  const [applied,   setApplied]   = useState({ startDate: defaultStart, endDate: defaultEnd });
  const [ratesDlg,  setRatesDlg] = useState(false);
  const [ratesForm, setRatesForm] = useState({ vatRate: "15", nhilRate: "2.5", getfundRate: "2.5", covidLevy: "0" });

  /* ── Query ───────────────────────────── */
  const { data, isLoading } = useQuery<VATReport>({
    queryKey: ["vat-report", applied.startDate, applied.endDate],
    queryFn: () => customFetch(`/api/vat-report?startDate=${applied.startDate}&endDate=${applied.endDate}`),
    staleTime: 30_000,
    onSuccess: (d: VATReport) => {
      setRatesForm({
        vatRate:     String(d.rates.vatRate),
        nhilRate:    String(d.rates.nhilRate),
        getfundRate: String(d.rates.getfundRate),
        covidLevy:   String(d.rates.covidLevy),
      });
    },
  } as any);

  /* ── Mutation ────────────────────────── */
  const saveRates = useMutation({
    mutationFn: () => customFetch("/api/vat-report/rates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ratesForm) }),
    onSuccess: () => {
      toast({ title: "Tax rates updated" });
      qc.invalidateQueries({ queryKey: ["vat-report"] });
      setRatesDlg(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Render ──────────────────────────── */
  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Ghana VAT / NHIL / GETFund Report
          </h2>
          <p className="text-xs text-muted-foreground">Tax breakdown on completed sales (VAT, NHIL, GETFund levies)</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRatesDlg(true)}>
          <Settings2 className="h-3.5 w-3.5" />Configure Rates
        </Button>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setApplied({ startDate, endDate })}>
          <ArrowRight className="h-3.5 w-3.5" />Apply
        </Button>
        {data && (
          <div className="ml-auto text-[11px] text-muted-foreground">
            Rates: VAT {pct(data.rates.vatRate)} · NHIL {pct(data.rates.nhilRate)} · GETFund {pct(data.rates.getfundRate)}
            {data.rates.covidLevy > 0 && ` · COVID Levy ${pct(data.rates.covidLevy)}`}
            {" "}= <strong>{pct(data.rates.totalTaxRate)}</strong> total
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}

      {data && !isLoading && (
        <>
          {/* Summary KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-3 pb-2">
                <p className="text-[10px] text-muted-foreground">Gross Revenue (incl. tax)</p>
                <p className="text-xl font-bold text-primary">{ghc(data.summary.grossRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">{data.summary.totalSales} completed sales</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="pt-3 pb-2">
                <p className="text-[10px] text-muted-foreground">Tax-Exclusive Revenue</p>
                <p className="text-xl font-bold text-emerald-400">{ghc(data.summary.taxExclusive)}</p>
                <p className="text-[10px] text-muted-foreground">before all levies</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-3 pb-2">
                <p className="text-[10px] text-muted-foreground">Total Tax Collected</p>
                <p className="text-xl font-bold text-amber-400">{ghc(data.summary.totalTaxCollected)}</p>
                <p className="text-[10px] text-muted-foreground">{pct(data.rates.totalTaxRate)} effective rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-[10px] text-muted-foreground">Tax Breakdown</p>
                <div className="space-y-0.5 mt-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">VAT ({pct(data.rates.vatRate)})</span>
                    <span className="font-mono">{ghc(data.summary.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">NHIL ({pct(data.rates.nhilRate)})</span>
                    <span className="font-mono">{ghc(data.summary.nhilAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">GETFund ({pct(data.rates.getfundRate)})</span>
                    <span className="font-mono">{ghc(data.summary.getfundAmount)}</span>
                  </div>
                  {data.rates.covidLevy > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">COVID Levy ({pct(data.rates.covidLevy)})</span>
                      <span className="font-mono">{ghc(data.summary.covidLevyAmount)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly breakdown + by payment method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Monthly */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Monthly Breakdown</h3>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead className="pl-4">Month</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right pr-4">NHIL+GEF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">No sales in period</TableCell></TableRow>
                    )}
                    {data.monthly.map(m => (
                      <TableRow key={m.month_key} className="text-xs">
                        <TableCell className="pl-4 font-medium">{m.month}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.sales_count}</TableCell>
                        <TableCell className="text-right font-mono">{ghc(m.gross)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-400">{ghc(m.vat)}</TableCell>
                        <TableCell className="text-right font-mono text-primary pr-4">{ghc(Number(m.nhil) + Number(m.getfund))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* By payment method */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Payment Method</h3>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead className="pl-4">Method</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right pr-4">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byMethod.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">No data</TableCell></TableRow>
                    )}
                    {data.byMethod.map(m => (
                      <TableRow key={m.method} className="text-xs">
                        <TableCell className="pl-4 capitalize font-medium">{m.method.replace("_"," ")}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.sales_count}</TableCell>
                        <TableCell className="text-right font-mono">{ghc(m.gross)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-400 pr-4">{ghc(m.vat)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Individual sales */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Transaction Detail (last {data.sales.length})
            </h3>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="pl-4">Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Excl. Tax</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">NHIL</TableHead>
                    <TableHead className="text-right pr-4">GETFund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sales.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">No transactions</TableCell></TableRow>
                  )}
                  {data.sales.map(s => (
                    <TableRow key={s.id} className="text-xs">
                      <TableCell className="pl-4 font-mono">{s.invoice_number}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[80px]">{s.customer_name}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{(s.payment_method ?? "cash").replace("_"," ")}</TableCell>
                      <TableCell className="text-right font-mono">{ghc(s.gross)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{ghc(s.exclusive)}</TableCell>
                      <TableCell className="text-right font-mono text-amber-400">{ghc(s.vat)}</TableCell>
                      <TableCell className="text-right font-mono text-blue-400">{ghc(s.nhil)}</TableCell>
                      <TableCell className="text-right font-mono text-primary pr-4">{ghc(s.getfund)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Configure Rates Dialog */}
      <Dialog open={ratesDlg} onOpenChange={setRatesDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Configure Ghana Tax Rates</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">These rates are used to compute the VAT/NHIL/GETFund breakdown from inclusive sale totals.</p>
          <div className="space-y-3 py-1">
            {[
              { key: "vatRate",     label: "VAT Rate (%)",         desc: "Standard VAT (currently 15%)" },
              { key: "nhilRate",    label: "NHIL Rate (%)",        desc: "National Health Insurance Levy (2.5%)" },
              { key: "getfundRate", label: "GETFund Rate (%)",     desc: "Ghana Education Trust Fund (2.5%)" },
              { key: "covidLevy",   label: "COVID-19 Levy (%)",    desc: "Currently 0% (was 1%)" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input type="number" min="0" max="100" step="0.1"
                  value={(ratesForm as any)[key]}
                  onChange={e => setRatesForm(f => ({ ...f, [key]: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            ))}
            <div className="rounded-lg bg-muted/40 p-2 text-[11px]">
              <span className="text-muted-foreground">Total effective rate: </span>
              <span className="font-bold text-primary">
                {(Number(ratesForm.vatRate) + Number(ratesForm.nhilRate) + Number(ratesForm.getfundRate) + Number(ratesForm.covidLevy)).toFixed(1)}%
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatesDlg(false)}>Cancel</Button>
            <Button onClick={() => saveRates.mutate()} disabled={saveRates.isPending}>
              {saveRates.isPending ? "Saving…" : "Save Rates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
