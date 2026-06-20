import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Warehouse, Plus, MapPin, Package, MoreVertical, Pencil, Trash2, Loader2, Star, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/workspace/api-client-react";

type WarehouseRow = {
  id: number;
  name: string;
  location: string | null;
  address: string | null;
  isDefault: boolean;
  totalUnits: number;
  productCount: number;
  createdAt: string;
};

type StockRow = {
  product: { id: number; name: string; sku: string | null; category: string | null };
  stock: number;
};

const GHS = (v: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

function useWarehouses() {
  return useQuery<WarehouseRow[]>({ queryKey: ["warehouses"], queryFn: () => customFetch("/api/warehouses") });
}

function useWarehouseStock(id: number | null) {
  return useQuery<StockRow[]>({
    queryKey: ["warehouse-stock", id],
    queryFn: () => customFetch(`/api/warehouses/${id}/stock`),
    enabled: id !== null,
  });
}

function WarehouseForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<WarehouseRow>;
  onSave: (d: { name: string; location: string; address: string; isDefault: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const valid = name.trim().length >= 2;
  return (
    <div className="space-y-4 pt-2">
      <div><label className="text-sm font-medium block mb-1">Warehouse Name *</label>
        <Input id="warehouse-name" name="name" placeholder="Main Warehouse" value={name} onChange={e => setName(e.target.value)} className="rounded-[20px]" />
      </div>
      <div><label className="text-sm font-medium block mb-1">Location</label>
        <Input id="warehouse-location" name="location" placeholder="City / Area" value={location} onChange={e => setLocation(e.target.value)} className="rounded-[20px]" />
      </div>
      <div><label className="text-sm font-medium block mb-1">Address</label>
        <Input id="warehouse-address" name="address" placeholder="Full address" value={address} onChange={e => setAddress(e.target.value)} className="rounded-[20px]" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input id="warehouse-is-default" name="isDefault" type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
        <span className="text-sm">Set as default warehouse</span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>Cancel</Button>
        <Button className="rounded-full" disabled={!valid || isPending} onClick={() => onSave({ name, location, address, isDefault })}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Warehouse
        </Button>
      </div>
    </div>
  );
}

export default function Warehouses() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<WarehouseRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: warehouses = [], isLoading } = useWarehouses();
  const { data: stockRows = [], isLoading: stockLoading } = useWarehouseStock(viewingId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["warehouses"] });

  const createMut = useMutation({
    mutationFn: (d: object) => customFetch("/api/warehouses", { method: "POST", body: JSON.stringify(d), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Warehouse created" }); setIsCreateOpen(false); invalidate(); },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: { id: number } & object) => customFetch(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(d), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Warehouse updated" }); setEditingWh(null); invalidate(); },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/warehouses/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Warehouse deleted" }); setDeletingId(null); invalidate(); },
    onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Warehouses</h2>
          <p className="text-muted-foreground">Multi-warehouse inventory management and stock tracking.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2"><Plus className="h-4 w-4" />Add Warehouse</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader><DialogTitle>New Warehouse</DialogTitle></DialogHeader>
            <WarehouseForm onSave={(d) => createMut.mutate(d)} onCancel={() => setIsCreateOpen(false)} isPending={createMut.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingWh} onOpenChange={o => { if (!o) setEditingWh(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Edit Warehouse</DialogTitle></DialogHeader>
          {editingWh && <WarehouseForm initial={editingWh} onSave={(d) => updateMut.mutate({ id: editingWh.id, ...d })} onCancel={() => setEditingWh(null)} isPending={updateMut.isPending} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={o => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the warehouse and its stock assignments permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingId && deleteMut.mutate(deletingId)} disabled={deleteMut.isPending}>
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-card rounded-3xl border border-dashed border-muted-foreground/20 p-12 text-center">
          <Warehouse className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-1">No warehouses yet</h3>
          <p className="text-muted-foreground mb-6">Add your first warehouse to start tracking multi-location stock.</p>
          <Button onClick={() => setIsCreateOpen(true)} className="rounded-full"><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(wh => (
            <Card key={wh.id} className="border-transparent shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                    <Warehouse className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-base">{wh.name}</CardTitle>
                      {wh.isDefault && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                    </div>
                    {wh.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{wh.location}</p>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingWh(wh)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewingId(viewingId === wh.id ? null : wh.id)}><Package className="h-4 w-4 mr-2" />View Stock</DropdownMenuItem>
                    {!wh.isDefault && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingId(wh.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem></>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                {wh.address && <p className="text-xs text-muted-foreground">{wh.address}</p>}
                <div className="flex gap-3">
                  <div className="flex-1 bg-muted/40 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{wh.totalUnits.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Units</p>
                  </div>
                  <div className="flex-1 bg-muted/40 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{wh.productCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Products</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Expandable Stock Detail */}
      {viewingId !== null && (
        <Card className="border-transparent shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Stock — {warehouses.find(w => w.id === viewingId)?.name}
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setViewingId(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent>
            {stockLoading ? <div className="h-24 bg-muted animate-pulse rounded-xl" /> : stockRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No stock assigned to this warehouse yet.</p>
            ) : (
              <div className="rounded-md border">
                <div className="grid grid-cols-3 p-3 border-b text-xs font-medium text-muted-foreground">
                  <div>Product</div><div>Category</div><div className="text-right">Stock</div>
                </div>
                {stockRows.map(r => (
                  <div key={r.product.id} className="grid grid-cols-3 p-3 border-b last:border-0 text-sm items-center">
                    <div className="font-medium">{r.product.name}</div>
                    <div className="text-muted-foreground">{r.product.category ?? "—"}</div>
                    <div className="text-right font-medium">{r.stock}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function X({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
