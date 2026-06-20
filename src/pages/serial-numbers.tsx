import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListProducts, getListProductsQueryKey } from "@/workspace/api-client-react";
import { customFetch } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Hash, Trash2, Loader2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

type SN = {
  id: number;
  productId: number;
  productName: string;
  serialNumber: string;
  status: string;
  warehouseId: number | null;
  saleId: number | null;
  notes: string | null;
  createdAt: string;
};

function useSNs(productId: string, status: string) {
  return useQuery<{ data: SN[]; total: number }>({
    queryKey: ["serial-numbers", productId, status],
    queryFn: () => customFetch(`/api/serial-numbers?limit=100${productId !== "all" ? `&productId=${productId}` : ""}${status !== "all" ? `&status=${status}` : ""}`),
  });
}

function statusColor(s: string) {
  switch (s) {
    case "available": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    case "sold": return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "reserved": return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
    case "returned": return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default: return "";
  }
}

export default function SerialNumbers() {
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [newSN, setNewSN] = useState({ productId: "", serialNumber: "", status: "available", notes: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: productsData } = useListProducts({ limit: 100 }, { query: { queryKey: getListProductsQueryKey({ limit: 100 }) } });
  const { data, isLoading } = useSNs(productFilter, statusFilter);
  const sns = (data?.data ?? []).filter(sn =>
    !search || sn.serialNumber.toLowerCase().includes(search.toLowerCase()) || sn.productName.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["serial-numbers"] });

  const createMut = useMutation({
    mutationFn: (d: object) => customFetch("/api/serial-numbers", { method: "POST", body: JSON.stringify(d), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Serial number registered" }); setIsCreateOpen(false); setNewSN({ productId: "", serialNumber: "", status: "available", notes: "" }); invalidate(); },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/serial-numbers/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Serial number removed" }); setDeletingId(null); invalidate(); },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const products = productsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Serial Numbers</h2>
          <p className="text-muted-foreground">Track individual unit serial numbers across your product inventory.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button className="rounded-full gap-2"><Plus className="h-4 w-4" />Register S/N</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader><DialogTitle>Register Serial Number</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium block mb-1">Product *</label>
                <Select value={newSN.productId} onValueChange={v => setNewSN(s => ({ ...s, productId: v }))}>
                  <SelectTrigger className="rounded-[20px]"><SelectValue placeholder="Select product…" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Serial Number *</label>
                <Input id="sn-serial-number" name="serialNumber" placeholder="SN-000000" value={newSN.serialNumber} onChange={e => setNewSN(s => ({ ...s, serialNumber: e.target.value }))} className="rounded-[20px] font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <Select value={newSN.status} onValueChange={v => setNewSN(s => ({ ...s, status: v }))}>
                  <SelectTrigger className="rounded-[20px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Notes</label>
                <Textarea id="sn-notes" name="notes" placeholder="Optional notes…" value={newSN.notes} onChange={e => setNewSN(s => ({ ...s, notes: e.target.value }))} className="rounded-[20px] resize-none" rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-full" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button className="rounded-full" disabled={!newSN.productId || !newSN.serialNumber.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ productId: Number(newSN.productId), serialNumber: newSN.serialNumber, status: newSN.status, notes: newSN.notes || null })}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Register
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="sn-search" name="search" placeholder="Search S/N or product…" className="pl-9 rounded-full" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-44 rounded-full"><SelectValue placeholder="All Products" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 rounded-full"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AlertDialog open={deletingId !== null} onOpenChange={o => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove serial number?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this serial number record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingId && deleteMut.mutate(deletingId)} disabled={deleteMut.isPending}>
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : sns.length === 0 ? (
        <div className="bg-card rounded-3xl border border-dashed border-muted-foreground/20 p-12 text-center">
          <Hash className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-1">No serial numbers found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Register serial numbers to track individual units — useful for electronics, appliances, and high-value items.</p>
          <Button onClick={() => setIsCreateOpen(true)} className="rounded-full"><Plus className="h-4 w-4 mr-2" />Register S/N</Button>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border overflow-hidden shadow-sm">
          <div className="grid grid-cols-5 px-4 py-2 border-b text-xs font-medium text-muted-foreground bg-muted/30">
            <div className="col-span-2">Serial Number</div><div>Product</div><div>Status</div><div className="text-right">Registered</div>
          </div>
          {sns.map(sn => (
            <div key={sn.id} className="grid grid-cols-5 px-4 py-3 border-b last:border-0 items-center text-sm hover:bg-muted/10 transition-colors">
              <div className="col-span-2 font-mono font-medium flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {sn.serialNumber}
              </div>
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{sn.productName}</span>
              </div>
              <div><Badge className={`text-[10px] border-0 ${statusColor(sn.status)}`}>{sn.status}</Badge></div>
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                {new Date(sn.createdAt).toLocaleDateString("en-GH")}
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(sn.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">{data?.total ?? 0} serial number{(data?.total ?? 0) !== 1 ? "s" : ""} total</p>
    </div>
  );
}
