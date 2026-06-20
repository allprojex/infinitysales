import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Building2, Plus, Pencil, Trash2, RefreshCw, Users, MapPin, Banknote } from "lucide-react";

const GHS = (v: number) => `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Department {
  id: number; name: string; description: string | null; headName: string | null;
  location: string | null; budget: string | null; employeeCount: number; createdAt: string;
}
interface DeptResp { data: Department[]; total: number; }

const EMPTY_FORM = { name: "", description: "", headName: "", location: "", budget: "" };

export default function Departments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [showForm, setShowForm] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading, refetch } = useQuery<DeptResp>({
    queryKey: ["departments"],
    queryFn: () => customFetch("/api/departments"),
  });

  const createDept = useMutation({
    mutationFn: (body: object) => customFetch("/api/departments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Department created" }); qc.invalidateQueries({ queryKey: ["departments"] }); setShowForm(false); setForm(EMPTY_FORM); },
    onError: () => toast({ title: "Failed — name may already exist", variant: "destructive" }),
  });

  const updateDept = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => customFetch(`/api/departments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Department updated" }); qc.invalidateQueries({ queryKey: ["departments"] }); setEditDept(null); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteDept = useMutation({
    mutationFn: (id: number) => customFetch(`/api/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Department deleted" }); qc.invalidateQueries({ queryKey: ["departments"] }); setDeleteId(null); },
  });

  const openEdit = (d: Department) => {
    setEditDept(d);
    setForm({ name: d.name, description: d.description ?? "", headName: d.headName ?? "", location: d.location ?? "", budget: d.budget ?? "" });
  };

  const buildBody = () => ({ name: form.name, description: form.description || null, headName: form.headName || null, location: form.location || null, budget: form.budget || null });

  const depts = data?.data ?? [];
  const totalEmployees = depts.reduce((s, d) => s + d.employeeCount, 0);
  const totalBudget = depts.reduce((s, d) => s + (Number(d.budget) || 0), 0);

  const FormBody = () => (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Department Name *</label>
        <Input className="h-8 text-xs" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sales & Marketing" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Description</label>
        <Textarea className="text-xs" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Department purpose and responsibilities…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Department Head</label>
          <Input className="h-8 text-xs" value={form.headName} onChange={e => setForm(f => ({ ...f, headName: e.target.value }))} placeholder="Name of head" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Location</label>
          <Input className="h-8 text-xs" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Office / branch" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Annual Budget (GHS)</label>
        <Input className="h-8 text-xs" type="number" min="0" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Departments</h1>
            <p className="text-xs text-muted-foreground">Manage organisational departments and budgets</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {isAdmin && <Button size="sm" onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }} className="gap-1.5"><Plus className="h-3.5 w-3.5" />New Department</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Departments</p>
            <p className="text-2xl font-bold text-violet-400">{depts.length}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Employees</p>
            <p className="text-2xl font-bold text-blue-400">{totalEmployees}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-lg font-bold text-emerald-400">{GHS(totalBudget)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />Loading…
        </div>
      )}

      {!isLoading && depts.length === 0 && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium">No departments yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first department to organise your workforce.</p>
            {isAdmin && <Button className="mt-4 gap-1.5" size="sm" onClick={() => setShowForm(true)}><Plus className="h-3.5 w-3.5" />New Department</Button>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {depts.map(d => (
          <Card key={d.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="h-9 w-9 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-violet-400" />
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
              <CardTitle className="text-base mt-2">{d.name}</CardTitle>
              {d.description && <p className="text-xs text-muted-foreground leading-relaxed">{d.description}</p>}
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{d.employeeCount} employee{d.employeeCount !== 1 ? "s" : ""}</span>
              </div>
              {d.headName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">Head:</span> {d.headName}
                </div>
              )}
              {d.location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {d.location}
                </div>
              )}
              {d.budget && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Banknote className="h-3 w-3" /> Budget: <span className="font-medium text-emerald-400">{GHS(Number(d.budget))}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Department</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createDept.mutate(buildBody())} disabled={createDept.isPending || !form.name.trim()}>
              {createDept.isPending ? "Creating…" : "Create Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDept} onOpenChange={open => !open && setEditDept(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Department</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDept(null)}>Cancel</Button>
            <Button onClick={() => editDept && updateDept.mutate({ id: editDept.id, body: buildBody() })} disabled={updateDept.isPending || !form.name.trim()}>
              {updateDept.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete department?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. Employees in this department will not be deleted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteDept.mutate(deleteId)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
