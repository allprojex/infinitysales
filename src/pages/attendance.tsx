import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ClipboardList, Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";

interface Employee { id: string; name: string; department: string | null; }
interface AttendanceRecord {
  id: string; employeeId: string; employeeName: string | null; department: string | null;
  date: string; clockIn: string | null; clockOut: string | null; status: string; notes: string | null; createdAt: string;
}
interface AttendanceResp { data: AttendanceRecord[]; total: number; }
interface EmpResp { data: Employee[]; }

const STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  absent: "bg-red-500/20 text-red-300 border-red-500/30",
  late: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  half_day: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const EMPTY_FORM = {
  employeeId: "", date: new Date().toISOString().split("T")[0],
  clockIn: "", clockOut: "", status: "present", notes: "",
};

function calcHours(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins <= 0) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState<AttendanceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const params = new URLSearchParams({ limit: "100", page: String(page) });
  if (filterMonth) params.set("month", filterMonth);

  const { data, isLoading, refetch } = useQuery<AttendanceResp>({
    queryKey: ["attendance", filterMonth, page],
    queryFn: () => customFetch(`/api/attendance?${params}`),
  });

  const { data: empData } = useQuery<EmpResp>({
    queryKey: ["employees-list"],
    queryFn: () => customFetch("/api/employees?limit=200"),
    enabled: showForm || !!editRec,
  });

  const createRec = useMutation({
    mutationFn: (body: object) => customFetch("/api/attendance", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Attendance recorded" }); qc.invalidateQueries({ queryKey: ["attendance"] }); setShowForm(false); setForm(EMPTY_FORM); },
    onError: () => toast({ title: "Failed to record attendance", variant: "destructive" }),
  });

  const updateRec = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => customFetch(`/api/attendance/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Attendance updated" }); qc.invalidateQueries({ queryKey: ["attendance"] }); setEditRec(null); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteRec = useMutation({
    mutationFn: (id: string) => customFetch(`/api/attendance/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Record deleted" }); qc.invalidateQueries({ queryKey: ["attendance"] }); setDeleteId(null); },
  });

  const openEdit = (r: AttendanceRecord) => {
    setEditRec(r);
    setForm({ employeeId: String(r.employeeId), date: r.date, clockIn: r.clockIn ?? "", clockOut: r.clockOut ?? "", status: r.status, notes: r.notes ?? "" });
  };

  const rows = data?.data ?? [];
  const filtered = search ? rows.filter(r => r.employeeName?.toLowerCase().includes(search.toLowerCase())) : rows;

  const present = rows.filter(r => r.status === "present").length;
  const absent = rows.filter(r => r.status === "absent").length;
  const late = rows.filter(r => r.status === "late").length;

  const FormBody = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Employee *</label>
          <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>{(empData?.data ?? []).map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Date *</label>
          <Input className="h-8 text-xs" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Clock In</label>
          <Input className="h-8 text-xs" type="time" value={form.clockIn} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Clock Out</label>
          <Input className="h-8 text-xs" type="time" value={form.clockOut} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="half_day">Half Day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
        <Input className="h-8 text-xs" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Attendance Tracking</h1>
            <p className="text-xs text-muted-foreground">Daily employee clock-in and clock-out records</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {isAdmin && <Button size="sm" onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Record Attendance</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Present</p>
            <p className="text-2xl font-bold text-emerald-400">{present}</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Absent</p>
            <p className="text-2xl font-bold text-red-400">{absent}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Late</p>
            <p className="text-2xl font-bold text-amber-400">{late}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 text-xs pl-8" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Input className="h-8 text-xs w-36" type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Employee</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Clock In</TableHead>
              <TableHead className="text-xs">Clock Out</TableHead>
              <TableHead className="text-xs">Hours</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-xs w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-10"><RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No attendance records for this period</TableCell></TableRow>}
            {filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium text-sm">{r.employeeName ?? "—"}</div>
                  {r.department && <div className="text-xs text-muted-foreground">{r.department}</div>}
                </TableCell>
                <TableCell className="text-sm">{r.date}</TableCell>
                <TableCell className="text-sm font-mono">{r.clockIn ?? "—"}</TableCell>
                <TableCell className="text-sm font-mono">{r.clockOut ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{calcHours(r.clockIn, r.clockOut)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[r.status] ?? ""}`}>{r.status.replace("_", " ")}</Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Attendance</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createRec.mutate({ employeeId: form.employeeId, date: form.date, clockIn: form.clockIn || null, clockOut: form.clockOut || null, status: form.status, notes: form.notes || null })} disabled={createRec.isPending || !form.employeeId || !form.date}>
              {createRec.isPending ? "Saving…" : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRec} onOpenChange={open => !open && setEditRec(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Attendance Record</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRec(null)}>Cancel</Button>
            <Button onClick={() => editRec && updateRec.mutate({ id: editRec.id, body: { clockIn: form.clockIn || null, clockOut: form.clockOut || null, status: form.status, notes: form.notes || null } })} disabled={updateRec.isPending}>
              {updateRec.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete attendance record?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteRec.mutate(deleteId)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
