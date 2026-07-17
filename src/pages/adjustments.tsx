import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListProducts } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  SlidersHorizontal,
  Plus,
  MoreVertical,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Adjustment = {
  id: number;
  productId: number;
  productName: string;
  adjustmentType: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason: string | null;
  notes: string | null;
  createdAt: string;
};

const TYPES = ["manual", "write-off", "damaged", "returned", "correction", "cycle-count"];

export default function Adjustments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [prodId, setProdId] = useState("");
  const [qtyChange, setQtyChange] = useState("");
  const [adjType, setAdjType] = useState("manual");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: productsData } = useListProducts({ limit: 200 });
  const products = productsData?.data ?? [];
  const { data: categoryResponse } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["product-categories", "adjustment-filter"],
    queryFn: () => customFetch("/api/product-categories"),
  });
  const filteredProducts =
    categoryFilter === "all"
      ? products
      : products.filter((product) => product.categoryId === categoryFilter);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adjustments"] });

  const { data, isLoading } = useQuery<{ data: Adjustment[]; total: number }>({
    queryKey: ["adjustments"],
    queryFn: () => customFetch("/api/adjustments?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (d: object) =>
      customFetch("/api/adjustments", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Adjustment recorded" });
      setCreating(false);
      setProdId("");
      setQtyChange("");
      setReason("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/adjustments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Adjustment removed" });
      setDeletingId(null);
      invalidate();
    },
  });

  const adjustments = data?.data ?? [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodId || !qtyChange) return;
    createMut.mutate({
      productId: Number(prodId),
      quantityChange: Number(qtyChange),
      adjustmentType: adjType,
      reason,
      notes,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Adjustments</h2>
          <p className="text-muted-foreground">
            Record inventory corrections, write-offs, and quantity changes.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="h-4 w-4" />
              New Adjustment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Stock Adjustment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium">Product *</label>
                <Select
                  value={categoryFilter}
                  onValueChange={(value) => {
                    setCategoryFilter(value);
                    setProdId("");
                  }}
                >
                  <SelectTrigger className="rounded-[20px] mt-1 mb-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryResponse?.data.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={prodId} onValueChange={setProdId}>
                  <SelectTrigger className="rounded-[20px] mt-1">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} — {p.category ?? "Other"} (stock: {p.stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">
                    Quantity Change * <span className="text-muted-foreground">(+ or -)</span>
                  </label>
                  <Input
                    id="adj-qty-change"
                    name="qtyChange"
                    type="number"
                    value={qtyChange}
                    onChange={(e) => setQtyChange(e.target.value)}
                    placeholder="+10 or -5"
                    className="rounded-[20px] mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Adjustment Type</label>
                  <Select value={adjType} onValueChange={setAdjType}>
                    <SelectTrigger className="rounded-[20px] mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Reason</label>
                <Input
                  id="adj-reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for adjustment"
                  className="rounded-[20px] mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <Textarea
                  id="adj-notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-[20px] mt-1"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={createMut.isPending || !prodId || !qtyChange}
                >
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record
                  Adjustment
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span>{data?.total ?? 0} adjustment records</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 bg-muted animate-pulse rounded-xl" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!adjustments.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <SlidersHorizontal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No adjustments recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-sm">{a.productName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {a.adjustmentType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{a.quantityBefore}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`flex items-center justify-end gap-0.5 font-semibold ${a.quantityChange > 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {a.quantityChange > 0 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {Math.abs(a.quantityChange)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{a.quantityAfter}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                        {a.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(a.createdAt), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeletingId(a.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove adjustment record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the adjustment log entry. Note: this does not revert the stock
              change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
