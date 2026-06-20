import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCircle, Plus, Search, Loader2, MoreHorizontal, Pencil, Trash2,
  Mail, Phone, MapPin, Building, FileText, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/workspace/api-client-react";
import { GhanaRegionPicker } from "@/components/ghana-region-picker";

type Contact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
};

function parsePhones(phone: string | null): string[] {
  if (!phone) return [""];
  if (phone.trimStart().startsWith("[")) {
    try { const arr = JSON.parse(phone); if (Array.isArray(arr)) return arr.length ? arr : [""]; } catch {}
  }
  return [phone];
}

function serializePhones(phones: string[]): string | null {
  const filtered = phones.map(p => p.trim()).filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  return JSON.stringify(filtered);
}

function useContacts(search: string) {
  return useQuery<{ data: Contact[]; total: number }>({
    queryKey: ["contacts", search],
    queryFn: () => customFetch(`/api/contacts?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });
}

function ContactForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<Contact>;
  onSave: (d: Omit<Contact, "id" | "createdAt">) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phones, setPhones] = useState<string[]>(() => parsePhones(initial?.phone ?? null));
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const valid = name.trim().length >= 2;

  const updatePhone = (idx: number, val: string) =>
    setPhones(prev => prev.map((p, i) => i === idx ? val : p));

  const addPhone = () => setPhones(prev => [...prev, ""]);

  const removePhone = (idx: number) =>
    setPhones(prev => prev.length === 1 ? [""] : prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className="text-sm font-medium block mb-1.5">Full Name *</label>
        <Input id="person-name" name="name" placeholder="Ama Owusu" value={name} onChange={e => setName(e.target.value)} className="rounded-[20px]" />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Email</label>
        <Input id="person-email" name="email" placeholder="ama@company.com" value={email} onChange={e => setEmail(e.target.value)} className="rounded-[20px]" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Phone Number{phones.length > 1 ? "s" : ""}</label>
        </div>
        <div className="space-y-2">
          {phones.map((p, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                name={`phones[${idx}]`}
                placeholder="+233 20 000 0000"
                value={p}
                onChange={e => updatePhone(idx, e.target.value)}
                className="rounded-[20px] flex-1"
              />
              {phones.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePhone(idx)}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addPhone}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors mt-1 ml-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add another number
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Company / Organisation</label>
          <Input id="person-company" name="company" placeholder="Acme Ghana Ltd" value={company} onChange={e => setCompany(e.target.value)} className="rounded-[20px]" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Role / Position</label>
          <Input id="person-role" name="role" placeholder="CEO, Partner…" value={role} onChange={e => setRole(e.target.value)} className="rounded-[20px]" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> City / Regional Capital
        </label>
        <GhanaRegionPicker value={city} onChange={setCity} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Street Address</label>
        <Input id="person-address" name="address" placeholder="12 Airport Road, Accra" value={address} onChange={e => setAddress(e.target.value)} className="rounded-[20px]" />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Notes</label>
        <Textarea id="person-notes" name="notes" placeholder="Any additional notes about this contact…" value={notes}
          onChange={e => setNotes(e.target.value)} className="rounded-[20px] resize-none" rows={2} />
      </div>
      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>Cancel</Button>
        <Button className="rounded-full" disabled={!valid || isPending}
          onClick={() => onSave({
            name,
            email: email || null,
            phone: serializePhones(phones),
            company: company || null, role: role || null,
            city: city || null, address: address || null,
            notes: notes || null,
          })}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Contact
        </Button>
      </div>
    </div>
  );
}

export default function People() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useContacts(debouncedSearch);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const createMutation = useMutation({
    mutationFn: (body: Omit<Contact, "id" | "createdAt">) =>
      customFetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setIsCreateOpen(false); toast({ title: "Contact added" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to create contact" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Contact) =>
      customFetch(`/api/contacts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setEditingContact(null); toast({ title: "Contact updated" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to update contact" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setDeletingId(null); toast({ title: "Contact removed" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to delete contact" }),
  });

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">People</h2>
          <p className="text-muted-foreground">Contacts, partners, and stakeholder directory.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2"><Plus className="h-4 w-4" /> New Contact</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
            <ContactForm onSave={(d) => createMutation.mutate(d)} onCancel={() => setIsCreateOpen(false)} isPending={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingContact} onOpenChange={(open) => { if (!open) setEditingContact(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          {editingContact && (
            <ContactForm initial={editingContact}
              onSave={(d) => updateMutation.mutate({ ...editingContact, ...d })}
              onCancel={() => setEditingContact(null)}
              isPending={updateMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove contact?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the contact record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId !== null && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="pb-3 border-b shrink-0">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="people-search" name="search" placeholder="Search people…" className="pl-9 rounded-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-auto min-h-0">
          <Table className="min-w-[580px]">
            <TableHeader className="bg-muted/30 sticky top-0 z-10">
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Company / Role</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <UserCircle className="h-10 w-10 opacity-30" />
                      <p className="font-medium text-foreground">No contacts yet</p>
                      <p className="text-sm">Add contacts to build your network directory.</p>
                      <Button variant="outline" className="rounded-full mt-1" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Add Contact
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-600 font-semibold text-sm shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {c.company && <div className="flex items-center gap-1 font-medium"><Building className="h-3 w-3 text-muted-foreground" />{c.company}</div>}
                        {c.role && <div className="text-muted-foreground text-xs mt-0.5">{c.role}</div>}
                        {!c.company && !c.role && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-0.5">
                        {c.email && <div className="flex items-center"><Mail className="h-3 w-3 mr-1.5 text-muted-foreground shrink-0" />{c.email}</div>}
                        {parsePhones(c.phone).filter(Boolean).map((num, i) => (
                          <div key={i} className="flex items-center text-muted-foreground">
                            <Phone className="h-3 w-3 mr-1.5 shrink-0" />{num}
                          </div>
                        ))}
                        {!c.email && !c.phone && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.city ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />{c.city}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      {c.notes ? (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="truncate">{c.notes}</span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingContact(c)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingId(c.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Remove
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
        {data && data.total > 0 && (
          <div className="p-3 border-t text-sm text-muted-foreground text-right">
            {data.total} contact{data.total !== 1 ? "s" : ""}
          </div>
        )}
      </Card>
    </div>
  );
}
