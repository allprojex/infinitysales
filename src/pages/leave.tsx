import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  CalendarOff,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  department: string | null;
}
interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string | null;
  department: string | null;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string;
}
interface LeaveResp {
  data: LeaveRequest[];
  total: number;
}
interface EmpResp {
  data: Employee[];
}

const LEAVE_TYPES = ["annual", "sick", "maternity", "paternity", "study", "other"];
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-300 border-red-500/30",
};
const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

const EMPTY_FORM = {
  employeeId: "",
  type: "annual",
  startDate: "",
  endDate: "",
  days: "1",
  reason: "",
};

export default function Leave() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editReq, setEditReq] = useState<LeaveRequest | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const params = new URLSearchParams({ limit: "100" });
  if (filterStatus !== "all") params.set("status", filterStatus);

  const { data, isLoading, refetch } = useQuery<LeaveResp>({
    queryKey: ["leave", filterStatus],
    queryFn: () => customFetch(`/api/leave?${params}`),
  });

  const { data: empData } = useQuery<EmpResp>({
    queryKey: ["employees-list"],
    queryFn: () => customFetch("/api/employees?limit=200"),
    enabled: showForm || !!editReq,
  });

  const createReq = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/leave", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Leave request created" });
      qc.invalidateQueries({ queryKey: ["leave"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast({ title: "Failed to create request", variant: "destructive" }),
  });

  const updateReq = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      customFetch(`/api/leave/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Leave request updated" });
      qc.invalidateQueries({ queryKey: ["leave"] });
      setEditReq(null);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteReq = useMutation({
    mutationFn: (id: string) => customFetch(`/api/leave/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Leave request deleted" });
      qc.invalidateQueries({ queryKey: ["leave"] });
      setDeleteId(null);
    },
  });

  const approve = (r: LeaveRequest) =>
    updateReq.mutate({ id: r.id, body: { ...r, status: "approved", approvedBy: user?.name } });
  const reject = (r: LeaveRequest) =>
    updateReq.mutate({ id: r.id, body: { ...r, status: "rejected", approvedBy: user?.name } });

  const openEdit = (r: LeaveRequest) => {
    setEditReq(r);
    setForm({
      employeeId: String(r.employeeId),
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      days: String(r.days),
      reason: r.reason ?? "",
    });
  };

  const rows = data?.data ?? [];
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const totalDays = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.days, 0);

  const FormBody = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Employee *</label>
          <Select
            value={form.employeeId}
            onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {(empData?.data ?? []).map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Leave Type</label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Start Date *
          </label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">End Date *</label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Days</label>
          <Input
            className="h-8 text-xs"
            type="number"
            min="1"
            value={form.days}
            onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Reason</label>
        <Textarea
          className="text-xs"
          rows={2}
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          placeholder="Reason for leave…"
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarOff className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Leave Management</h1>
            <p className="text-xs text-muted-foreground">
              Track and approve employee leave requests
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setShowForm(true);
                setForm(EMPTY_FORM);
              }}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Request
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{pending}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-emerald-400">{approved}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Days Approved</p>
            <p className="text-2xl font-bold text-blue-400">{totalDays}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground flex items-center">
          {rows.length} requests
        </span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Employee</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-center">Days</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-xs w-36">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  No leave requests
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const Icon = STATUS_ICONS[r.status] ?? Clock;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.employeeName ?? "—"}</div>
                    {r.department && (
                      <div className="text-xs text-muted-foreground">{r.department}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="capitalize text-sm">{r.type}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.startDate} → {r.endDate}
                  </TableCell>
                  <TableCell className="text-center font-medium">{r.days}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] gap-1 ${STATUS_COLORS[r.status] ?? ""}`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {r.status}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {r.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              onClick={() => approve(r)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => reject(r)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(r.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createReq.mutate({
                  employeeId: form.employeeId,
                  type: form.type,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  days: Number(form.days),
                  reason: form.reason,
                })
              }
              disabled={createReq.isPending || !form.employeeId || !form.startDate || !form.endDate}
            >
              {createReq.isPending ? "Creating…" : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editReq} onOpenChange={(open) => !open && setEditReq(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Leave Request</DialogTitle>
          </DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReq(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editReq &&
                updateReq.mutate({
                  id: editReq.id,
                  body: {
                    employeeId: form.employeeId,
                    type: form.type,
                    startDate: form.startDate,
                    endDate: form.endDate,
                    days: Number(form.days),
                    reason: form.reason,
                    status: editReq.status,
                  },
                })
              }
              disabled={updateReq.isPending}
            >
              {updateReq.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete leave request?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteReq.mutate(deleteId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
