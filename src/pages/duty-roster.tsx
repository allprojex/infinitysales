import { useState } from "react";
import { customFetch } from "@/workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays,
  Users,
  Clock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, isToday, parseISO } from "date-fns";

type DutyRosterShift = {
  id: number;
  userId: number | null;
  userName: string;
  userEmail: string | null;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  shiftType: string;
  location: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

const SHIFT_TYPE_COLORS: Record<string, string> = {
  regular: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  overtime: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  weekend: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  holiday: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  remote: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  scheduled: {
    label: "Scheduled",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: Calendar,
  },
  attended: {
    label: "Attended",
    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    icon: CheckCircle2,
  },
  absent: {
    label: "Absent",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400",
    icon: XCircle,
  },
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekStart(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export default function DutyRoster() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"week" | "list">("week");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DutyRosterShift | null>(null);
  const [form, setForm] = useState({
    userName: "",
    userEmail: "",
    shiftDate: format(new Date(), "yyyy-MM-dd"),
    shiftStart: "08:00",
    shiftEnd: "17:00",
    shiftType: "regular",
    location: "Main Branch",
    notes: "",
    status: "scheduled",
  });

  const weekStart = getWeekStart(currentWeek);
  const weekEnd = addDays(weekStart, 6);

  const queryKey = ["duty-roster", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () =>
      customFetch<{ data: DutyRosterShift[]; total: number }>(
        `/api/duty-roster?startDate=${format(weekStart, "yyyy-MM-dd")}&endDate=${format(weekEnd, "yyyy-MM-dd")}&limit=200`,
      ),
  });

  const { data: statsData } = useQuery({
    queryKey: ["duty-roster-stats"],
    queryFn: async () =>
      customFetch<{
        todayShifts: number;
        totalShifts: number;
        topUsers: Array<{ name: string; count: number }>;
      }>("/api/duty-roster/stats"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["duty-roster"] });
    qc.invalidateQueries({ queryKey: ["duty-roster-stats"] });
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      userName: "",
      userEmail: "",
      shiftDate: format(new Date(), "yyyy-MM-dd"),
      shiftStart: "08:00",
      shiftEnd: "17:00",
      shiftType: "regular",
      location: "Main Branch",
      notes: "",
      status: "scheduled",
    });
    setIsDialogOpen(true);
  };

  const openEdit = (shift: DutyRosterShift) => {
    setEditing(shift);
    setForm({
      userName: shift.userName,
      userEmail: shift.userEmail ?? "",
      shiftDate: shift.shiftDate,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      shiftType: shift.shiftType,
      location: shift.location ?? "Main Branch",
      notes: shift.notes ?? "",
      status: shift.status,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.userName || !form.shiftDate || !form.shiftStart || !form.shiftEnd) {
      toast({
        title: "Validation Error",
        description: "Name, date, and shift times are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editing) {
        await customFetch(`/api/duty-roster/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({
          title: "Shift Updated",
          description: `${form.userName}'s shift updated successfully.`,
        });
      } else {
        await customFetch("/api/duty-roster", { method: "POST", body: JSON.stringify(form) });
        toast({
          title: "Shift Scheduled",
          description: `${form.userName} scheduled for ${form.shiftDate}.`,
        });
      }
      setIsDialogOpen(false);
      refresh();
    } catch {
      toast({ title: "Error", description: "Could not save shift.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await customFetch(`/api/duty-roster/${id}`, { method: "DELETE" });
      toast({ title: "Shift Deleted", variant: "destructive" });
      refresh();
    } catch {
      toast({ title: "Error", description: "Could not delete shift.", variant: "destructive" });
    }
  };

  const handleStatusChange = async (shift: DutyRosterShift, newStatus: string) => {
    try {
      await customFetch(`/api/duty-roster/${shift.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      refresh();
    } catch {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    }
  };

  const shifts = data?.data ?? [];

  const getShiftsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return shifts.filter((s) => s.shiftDate === dateStr);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Duty Roster</h2>
          <p className="text-muted-foreground">
            Manage staff shift schedules and duty assignments.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Shift
        </Button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsData?.todayShifts ?? 0}</p>
              <p className="text-xs text-muted-foreground">On Duty Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{shifts.length}</p>
              <p className="text-xs text-muted-foreground">Shifts This Week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsData?.totalShifts ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Shifts Recorded</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Weekly Schedule
            </CardTitle>
            <CardDescription className="text-xs">
              {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek((d) => addDays(d, -7))}
            >
              ← Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(new Date())}
              className="text-xs"
            >
              This Week
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek((d) => addDays(d, 7))}
            >
              Next →
            </Button>
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                size="sm"
                variant={view === "week" ? "secondary" : "ghost"}
                className="rounded-none h-8 text-xs"
                onClick={() => setView("week")}
              >
                Week
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                className="rounded-none h-8 text-xs"
                onClick={() => setView("list")}
              >
                List
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading shifts...</div>
          ) : view === "week" ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => {
                const day = addDays(weekStart, i);
                const dayShifts = getShiftsForDay(day);
                const today = isToday(day);
                return (
                  <div
                    key={i}
                    className={`min-h-[140px] rounded-xl border p-2 ${today ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border/50"}`}
                  >
                    <div
                      className={`text-center mb-2 ${today ? "text-primary font-bold" : "text-muted-foreground"}`}
                    >
                      <p className="text-[10px] uppercase tracking-wide">
                        {DAYS_OF_WEEK[day.getDay()]}
                      </p>
                      <p
                        className={`text-lg font-bold leading-tight ${today ? "text-primary" : ""}`}
                      >
                        {format(day, "d")}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {dayShifts.map((s) => {
                        const sc = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.scheduled;
                        return (
                          <button
                            key={s.id}
                            onClick={() => openEdit(s)}
                            className={`w-full text-left rounded-lg px-1.5 py-1 text-[10px] font-medium transition-all hover:shadow-md ${SHIFT_TYPE_COLORS[s.shiftType] ?? SHIFT_TYPE_COLORS.regular}`}
                          >
                            <p className="font-semibold truncate">{s.userName}</p>
                            <p className="opacity-80">
                              {s.shiftStart.slice(0, 5)}–{s.shiftEnd.slice(0, 5)}
                            </p>
                          </button>
                        );
                      })}
                      {dayShifts.length === 0 && (
                        <p className="text-[10px] text-center text-muted-foreground/60 mt-2">
                          No shifts
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No shifts scheduled this week.
                      </TableCell>
                    </TableRow>
                  ) : (
                    shifts.map((shift) => {
                      const sc = STATUS_CONFIG[shift.status] ?? STATUS_CONFIG.scheduled;
                      const StatusIcon = sc.icon;
                      return (
                        <TableRow key={shift.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {shift.userName.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{shift.userName}</p>
                                {shift.userEmail && (
                                  <p className="text-xs text-muted-foreground">{shift.userEmail}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(parseISO(shift.shiftDate), "EEE, MMM d")}
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {shift.shiftStart.slice(0, 5)} – {shift.shiftEnd.slice(0, 5)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-[10px] ${SHIFT_TYPE_COLORS[shift.shiftType] ?? ""}`}
                            >
                              {shift.shiftType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {shift.location ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={shift.status}
                              onValueChange={(v) => handleStatusChange(shift, v)}
                            >
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <Badge className={`text-[10px] gap-1 ${sc.color}`}>
                                  <StatusIcon className="h-2.5 w-2.5" />
                                  {sc.label}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                  <SelectItem key={k} value={k} className="text-xs">
                                    {v.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => openEdit(shift)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Shift?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove {shift.userName}'s shift on {shift.shiftDate}?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(shift.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Shift Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shift" : "Schedule New Shift"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update shift details." : "Add a new duty shift for a staff member."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Staff Name *</Label>
                <Input
                  id="roster-user-name"
                  name="userName"
                  value={form.userName}
                  onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))}
                  placeholder="e.g. John Asante"
                  className="h-9 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Email</Label>
                <Input
                  id="roster-user-email"
                  name="userEmail"
                  value={form.userEmail}
                  onChange={(e) => setForm((f) => ({ ...f, userEmail: e.target.value }))}
                  placeholder="john@example.com"
                  type="email"
                  className="h-9 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Shift Date *</Label>
                <Input
                  id="roster-shift-date"
                  name="shiftDate"
                  value={form.shiftDate}
                  onChange={(e) => setForm((f) => ({ ...f, shiftDate: e.target.value }))}
                  type="date"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Start Time *</Label>
                <Input
                  id="roster-shift-start"
                  name="shiftStart"
                  value={form.shiftStart}
                  onChange={(e) => setForm((f) => ({ ...f, shiftStart: e.target.value }))}
                  type="time"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">End Time *</Label>
                <Input
                  id="roster-shift-end"
                  name="shiftEnd"
                  value={form.shiftEnd}
                  onChange={(e) => setForm((f) => ({ ...f, shiftEnd: e.target.value }))}
                  type="time"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Shift Type</Label>
                <Select
                  value={form.shiftType}
                  onValueChange={(v) => setForm((f) => ({ ...f, shiftType: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(SHIFT_TYPE_COLORS).map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Location</Label>
                <Input
                  id="roster-location"
                  name="location"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Main Branch"
                  className="h-9 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Notes</Label>
                <Textarea
                  id="roster-notes"
                  name="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editing ? "Update Shift" : "Schedule Shift"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
