import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Gift,
  Plus,
  Minus,
  RefreshCw,
  Search,
  History,
  Star,
  Users,
  TrendingUp,
  Award,
  Wallet,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
interface LoyaltyStats {
  totalMembers: number;
  totalOutstandingPoints: number;
  pointsRedeemedToday: number;
  pointsAwardedToday: number;
}
interface LoyaltyCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  city: string | null;
  status: string;
  loyaltyPoints: number;
  totalSpend: number;
  tier: string;
  lastTransaction: string | null;
  transactionCount: number;
}
interface LoyaltyTransaction {
  id: number;
  customerId: number;
  customerName: string | null;
  type: string;
  points: number;
  balanceAfter: number;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
}
interface CustomersResp {
  total: number;
  items: LoyaltyCustomer[];
}
interface TxnsResp {
  data: LoyaltyTransaction[];
  total: number;
}

/* ── Helpers ────────────────────────────────────────────── */
const TIER_STYLES: Record<string, { badge: string; label: string; min: number }> = {
  platinum: {
    badge: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    label: "Platinum",
    min: 5000,
  },
  gold: { badge: "bg-amber-500/20  text-amber-300  border-amber-500/30", label: "Gold", min: 2000 },
  silver: {
    badge: "bg-slate-400/20  text-slate-300  border-slate-400/30",
    label: "Silver",
    min: 500,
  },
  bronze: {
    badge: "bg-orange-700/20 text-orange-300 border-orange-700/30",
    label: "Bronze",
    min: 0,
  },
};

const TXN_STYLES: Record<string, string> = {
  award: "text-emerald-400",
  redeem: "text-red-400",
  expire: "text-slate-400",
  adjust: "text-blue-400",
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(v);

const pts2ghs = (pts: number) => GHS(pts / 100); // 100 pts = GHS 1

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLES[tier] ?? TIER_STYLES.bronze;
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${s.badge}`}>
      <Star className="h-2.5 w-2.5 mr-0.5" />
      {s.label}
    </Badge>
  );
}

function PointsBar({ points }: { points: number }) {
  const nextTiers = [500, 2000, 5000, Infinity];
  const next = nextTiers.find((t) => t > points) ?? Infinity;
  const prev = [0, 500, 2000, 5000].reverse().find((t) => t <= points) ?? 0;
  const pct = next === Infinity ? 100 : Math.round(((points - prev) / (next - prev)) * 100);
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */
export default function Loyalty() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyCustomer | null>(null);
  const [showAward, setShowAward] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [actionPoints, setActionPoints] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [activeTab, setActiveTab] = useState("customers");

  /* ── Queries ──────────────────────────────────────────── */
  const { data: stats, refetch: refetchStats } = useQuery<LoyaltyStats>({
    queryKey: ["loyalty-stats"],
    queryFn: () => customFetch("/api/loyalty/stats"),
    refetchInterval: 60000,
  });

  const params = new URLSearchParams({ limit: "200" });
  if (search) params.set("search", search);

  const {
    data: custData,
    isLoading,
    refetch: refetchCusts,
  } = useQuery<CustomersResp>({
    queryKey: ["loyalty-customers", search],
    queryFn: () => customFetch(`/api/loyalty/customers?${params}`),
  });

  const { data: txnsData, isLoading: txnsLoading } = useQuery<TxnsResp>({
    queryKey: ["loyalty-transactions", activeTab === "transactions" ? "all" : null],
    queryFn: () => customFetch("/api/loyalty/transactions?limit=100"),
    enabled: activeTab === "transactions",
  });

  const { data: custTxns } = useQuery<TxnsResp>({
    queryKey: ["loyalty-transactions-customer", selectedCustomer?.id],
    queryFn: () =>
      customFetch(`/api/loyalty/transactions?customerId=${selectedCustomer!.id}&limit=50`),
    enabled: !!selectedCustomer && showHistory,
  });

  /* ── Mutations ────────────────────────────────────────── */
  const award = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/loyalty/award", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: `Awarded ${actionPoints} points` });
      qc.invalidateQueries({ queryKey: ["loyalty-customers"] });
      qc.invalidateQueries({ queryKey: ["loyalty-stats"] });
      qc.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setShowAward(false);
      setActionPoints("");
      setActionNote("");
    },
    onError: () => toast({ title: "Failed to award points", variant: "destructive" }),
  });

  const redeem = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/loyalty/redeem", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: `Redeemed ${actionPoints} points` });
      qc.invalidateQueries({ queryKey: ["loyalty-customers"] });
      qc.invalidateQueries({ queryKey: ["loyalty-stats"] });
      qc.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setShowRedeem(false);
      setActionPoints("");
      setActionNote("");
    },
    onError: (err: any) =>
      toast({ title: err?.message ?? "Insufficient points", variant: "destructive" }),
  });

  const refetchAll = () => {
    refetchStats();
    refetchCusts();
  };

  /* ── Filtered list ────────────────────────────────────── */
  const allCustomers = custData?.items ?? [];
  const displayed =
    tierFilter === "all" ? allCustomers : allCustomers.filter((c) => c.tier === tierFilter);

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Customer Loyalty</h1>
            <p className="text-xs text-muted-foreground">
              Manage points, tiers, and rewards — 100 pts = GHS 1
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              Members
            </div>
            <p className="text-2xl font-bold text-violet-400">{stats?.totalMembers ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" />
              Outstanding
            </div>
            <p className="text-2xl font-bold text-amber-400">
              {(stats?.totalOutstandingPoints ?? 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pts2ghs(stats?.totalOutstandingPoints ?? 0)} value
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Awarded Today
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {(stats?.pointsAwardedToday ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Award className="h-3.5 w-3.5" />
              Redeemed Today
            </div>
            <p className="text-2xl font-bold text-red-400">
              {(stats?.pointsRedeemedToday ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(TIER_STYLES).map(([key, s]) => (
          <div key={key} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40">
            <Star className="h-3 w-3" />
            <span className="font-medium capitalize">{s.label}</span>
            <span className="text-muted-foreground">
              {s.min === 0
                ? "0–499"
                : key === "platinum"
                  ? "5000+"
                  : `${s.min}–${Object.values(TIER_STYLES).find((_, i) => Object.keys(TIER_STYLES)[i] === (key === "bronze" ? "silver" : key === "silver" ? "gold" : "platinum"))?.min ?? ""}−1`}{" "}
              pts
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 text-muted-foreground">
          100 pts = GHS 1.00
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="customers" className="text-xs">
            Members
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs">
            All Transactions
          </TabsTrigger>
        </TabsList>

        {/* Members tab */}
        <TabsContent value="customers" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 text-xs pl-8"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="platinum">Platinum</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
                <SelectItem value="bronze">Bronze</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground flex items-center">
              {displayed.length} members
            </span>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs text-right">Points</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                  <TableHead className="text-xs text-right">Total Spend</TableHead>
                  <TableHead className="text-xs">Last Activity</TableHead>
                  {isAdmin && <TableHead className="text-xs w-32">Actions</TableHead>}
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
                {!isLoading && displayed.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No loyalty members found
                    </TableCell>
                  </TableRow>
                )}
                {displayed.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TierBadge tier={c.tier} />
                        <PointsBar points={c.loyaltyPoints} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-sm">
                        {c.loyaltyPoints.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-emerald-400">
                      {pts2ghs(c.loyaltyPoints)}
                    </TableCell>
                    <TableCell className="text-right text-sm">{GHS(c.totalSpend)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.lastTransaction
                        ? new Date(c.lastTransaction).toLocaleDateString("en-GH")
                        : "—"}
                      {c.transactionCount > 0 && (
                        <div className="text-[10px]">{c.transactionCount} txns</div>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setShowAward(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Award
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setShowRedeem(true);
                            }}
                            disabled={c.loyaltyPoints === 0}
                          >
                            <Minus className="h-3 w-3 mr-0.5" />
                            Redeem
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setShowHistory(true);
                            }}
                          >
                            <History className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* All Transactions tab */}
        <TabsContent value="transactions" className="mt-3">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Points</TableHead>
                  <TableHead className="text-xs text-right">Balance After</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnsLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!txnsLoading && (txnsData?.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                )}
                {(txnsData?.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">{t.customerName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${t.type === "award" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : t.type === "redeem" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"}`}
                      >
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold text-sm ${TXN_STYLES[t.type] ?? ""}`}
                    >
                      {t.points > 0 ? "+" : ""}
                      {t.points.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {t.balanceAfter.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString("en-GH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Award Dialog */}
      <Dialog
        open={showAward}
        onOpenChange={(open) => {
          if (!open) {
            setShowAward(false);
            setActionPoints("");
            setActionNote("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-400" />
              Award Loyalty Points
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/40 text-sm">
                <p className="font-medium">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Current balance:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedCustomer.loyaltyPoints.toLocaleString()} pts
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    ({pts2ghs(selectedCustomer.loyaltyPoints)})
                  </span>
                </p>
                <TierBadge tier={selectedCustomer.tier} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Points to Award *
                </label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min="1"
                  max="50000"
                  value={actionPoints}
                  onChange={(e) => setActionPoints(e.target.value)}
                  placeholder="e.g. 100"
                />
                {actionPoints && Number(actionPoints) > 0 && (
                  <p className="text-[10px] text-emerald-400 mt-1">
                    New balance:{" "}
                    {(selectedCustomer.loyaltyPoints + Number(actionPoints)).toLocaleString()} pts ·{" "}
                    {pts2ghs(selectedCustomer.loyaltyPoints + Number(actionPoints))}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Note (optional)
                </label>
                <Input
                  className="h-8 text-xs"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Reason for award…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAward(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                award.mutate({
                  customerId: selectedCustomer?.id,
                  points: Number(actionPoints),
                  description: actionNote || undefined,
                })
              }
              disabled={award.isPending || !actionPoints || Number(actionPoints) <= 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {award.isPending ? "Awarding…" : "Award Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog
        open={showRedeem}
        onOpenChange={(open) => {
          if (!open) {
            setShowRedeem(false);
            setActionPoints("");
            setActionNote("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-red-400" />
              Redeem Loyalty Points
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/40 text-sm">
                <p className="font-medium">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Available:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedCustomer.loyaltyPoints.toLocaleString()} pts
                  </span>
                  <span className="ml-2 text-emerald-400">
                    = {pts2ghs(selectedCustomer.loyaltyPoints)}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Points to Redeem *
                </label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min="1"
                  max={selectedCustomer.loyaltyPoints}
                  value={actionPoints}
                  onChange={(e) => setActionPoints(e.target.value)}
                  placeholder="e.g. 500"
                />
                {actionPoints && Number(actionPoints) > 0 && (
                  <p className="text-[10px] mt-1">
                    <span className="text-emerald-400">
                      Discount value: {pts2ghs(Number(actionPoints))}
                    </span>
                    {Number(actionPoints) > selectedCustomer.loyaltyPoints && (
                      <span className="text-red-400 ml-2">Exceeds balance!</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Note (optional)
                </label>
                <Input
                  className="h-8 text-xs"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Redemption reason…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRedeem(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                redeem.mutate({
                  customerId: selectedCustomer?.id,
                  points: Number(actionPoints),
                  description: actionNote || undefined,
                })
              }
              disabled={
                redeem.isPending ||
                !actionPoints ||
                Number(actionPoints) <= 0 ||
                Number(actionPoints) > (selectedCustomer?.loyaltyPoints ?? 0)
              }
              variant="destructive"
            >
              {redeem.isPending ? "Redeeming…" : "Redeem Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={showHistory} onOpenChange={(open) => !open && setShowHistory(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Transaction History — {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Points</TableHead>
                  <TableHead className="text-xs text-right">Balance</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(custTxns?.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                )}
                {(custTxns?.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${t.type === "award" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : t.type === "redeem" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"}`}
                      >
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold text-sm ${TXN_STYLES[t.type] ?? ""}`}
                    >
                      {t.points > 0 ? "+" : ""}
                      {t.points.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {t.balanceAfter.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-36">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString("en-GH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
