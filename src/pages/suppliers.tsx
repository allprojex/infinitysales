import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Truck, Phone, Mail, MoreVertical, Pencil, Trash2, Loader2, User, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { GhanaRegionPicker } from "@/components/ghana-region-picker";
import { format } from "date-fns";

type Supplier = {
  id: number; name: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; contactPerson: string | null;
  notes: string | null; createdAt: string;
};

function useSuppliers(search: string) {
  return useQuery<{ data: Supplier[]; total: number; page: number; limit: number }>({
    queryKey: ["suppliers", search],
    queryFn: () => customFetch(`/api/suppliers?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });
}

function SupplierForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<Supplier>;
  onSave: (d: Omit<Supplier, "id" | "createdAt">) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const valid = name.trim().length >= 2;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="text-sm font-medium block mb-1">Supplier Name *</label>
        <Input id="supplier-name" name="name" placeholder="Acme Ghana Ltd" value={name} onChange={e => setName(e.target.value)} className="rounded-[20px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Email</label>
          <Input id="supplier-email" name="email" placeholder="supplier@email.com" value={email} onChange={e => setEmail(e.target.value)} className="rounded-[20px]" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Phone</label>
          <Input id="supplier-phone" name="phone" placeholder="+233 20 000 0000" value={phone} onChange={e => setPhone(e.target.value)} className="rounded-[20px]" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Contact Person</label>
        <Input id="supplier-contact" name="contactPerson" placeholder="Ama Owusu" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="rounded-[20px]" />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> City / Regional Capital
        </label>
        <GhanaRegionPicker value={city} onChange={setCity} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Street Address</label>
        <Input id="supplier-address" name="address" placeholder="45 Liberation Road, Accra" value={address} onChange={e => setAddress(e.target.value)} className="rounded-[20px]" />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Notes</label>
        <Textarea id="supplier-notes" name="notes" placeholder="Additional notes…" value={notes} onChange={e => setNotes(e.target.value)} className="rounded-[20px] resize-none" rows={2} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>Cancel</Button>
        <Button className="rounded-full" disabled={!valid || isPending}
          onClick={() => onSave({ name, email: email || null, phone: phone || null, address: address || null, city: city || null, contactPerson: contactPerson || null, notes: notes || null })}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Supplier
        </Button>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useSuppliers(debouncedSearch);

  const createMutation = useMutation({
    mutationFn: (body: Omit<Supplier, "id" | "createdAt">) =>
      customFetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); setIsCreateOpen(false); toast({ title: "Supplier created" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to create supplier" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Supplier) =>
      customFetch(`/api/suppliers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); setEditingSupplier(null); toast({ title: "Supplier updated" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to update supplier" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); setDeletingId(null); toast({ title: "Supplier deleted" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to delete supplier" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground">Manage your supply chain partners.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2"><Plus className="h-4 w-4" /> New Supplier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
            <SupplierForm onSave={(d) => createMutation.mutate(d)} onCancel={() => setIsCreateOpen(false)} isPending={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingSupplier} onOpenChange={(open) => { if (!open) setEditingSupplier(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
          {editingSupplier && (
            <SupplierForm initial={editingSupplier}
              onSave={(d) => updateMutation.mutate({ ...editingSupplier, ...d })}
              onCancel={() => setEditingSupplier(null)}
              isPending={updateMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the supplier record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId !== null && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="suppliers-search" name="search" placeholder="Search suppliers…" className="pl-9 rounded-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[480px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (Array.isArray(data) ? data : data?.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Truck className="h-10 w-10 opacity-30" />
                      <p className="font-medium text-foreground">No suppliers yet</p>
                      <Button variant="outline" className="rounded-full" onClick={() => setIsCreateOpen(true)}>Add a supplier</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (Array.isArray(data) ? data : data?.data ?? []).map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-600 font-bold shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{s.name}</div>
                          {s.contactPerson && (
                            <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                              <User className="h-3 w-3 mr-1" />{s.contactPerson}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        {s.email && <div className="flex items-center"><Mail className="h-3 w-3 mr-2 text-muted-foreground" />{s.email}</div>}
                        {s.phone && <div className="flex items-center text-muted-foreground"><Phone className="h-3 w-3 mr-2" />{s.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.city ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />{s.city}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(s.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingSupplier(s)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingId(s.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
