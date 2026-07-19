import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Briefcase,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Banknote,
  User,
  CheckCircle2,
  Clock,
  PauseCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Project = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  assignedTo: string | null;
  createdAt: string;
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
};
const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};
const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  completed: <CheckCircle2 className="h-4 w-4 text-blue-600" />,
  paused: <PauseCircle className="h-4 w-4 text-amber-500" />,
  cancelled: <Clock className="h-4 w-4 text-red-500" />,
};

function ProjectForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Project>;
  onSave: (d: Partial<Project>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [budget, setBudget] = useState(String(initial?.budget ?? ""));
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name,
      description: description || null,
      status,
      priority,
      budget: budget ? Number(budget) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      assignedTo: assignedTo || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div>
        <label className="text-xs font-medium">Project Name *</label>
        <Input
          id="project-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="rounded-[20px] mt-1"
        />
      </div>
      <div>
        <label className="text-xs font-medium">Description</label>
        <Textarea
          id="project-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-[20px] mt-1"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="rounded-[20px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["active", "completed", "paused", "cancelled"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="rounded-[20px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["low", "medium", "high", "urgent"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Budget (GHS)</label>
          <Input
            id="project-budget"
            name="budget"
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0.00"
            className="rounded-[20px] mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Assigned To</label>
          <Input
            id="project-assigned-to"
            name="assignedTo"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Team / Person"
            className="rounded-[20px] mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Start Date</label>
          <Input
            id="project-start-date"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[20px] mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium">End Date</label>
          <Input
            id="project-end-date"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[20px] mt-1"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="rounded-full" disabled={isPending || !name.trim()}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial?.id ? "Update Project" : "Create Project"}
        </Button>
      </div>
    </form>
  );
}

export default function Projects() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["projects"] });

  const { data, isLoading } = useQuery<{ data: Project[]; total: number }>({
    queryKey: ["projects", statusFilter],
    queryFn: () =>
      customFetch(
        `/api/projects?limit=50${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`,
      ),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Project>) =>
      customFetch("/api/projects", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Project created" });
      setCreating(false);
      invalidate();
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Project> & { id: number }) =>
      customFetch(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => {
      toast({ title: "Project updated" });
      setEditing(null);
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Project deleted" });
      setDeletingId(null);
      invalidate();
    },
  });

  const projects = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground">
            Manage business projects, timelines, and team assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-full w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["active", "completed", "paused", "cancelled"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button className="rounded-full gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
              </DialogHeader>
              <ProjectForm
                onSave={(d) => createMut.mutate(d)}
                onCancel={() => setCreating(false)}
                isPending={createMut.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : !projects.length ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm mt-1">Click New Project to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="relative group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {statusIcons[p.status] ?? <Briefcase className="h-4 w-4 text-primary" />}
                    </div>
                    <CardTitle className="text-sm leading-snug truncate">{p.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full flex-shrink-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeletingId(p.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <Badge
                    className={`${statusColors[p.status] ?? ""} border-0 text-[10px] capitalize`}
                  >
                    {p.status}
                  </Badge>
                  <Badge
                    className={`${priorityColors[p.priority] ?? ""} border-0 text-[10px] capitalize`}
                  >
                    {p.priority}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {p.description && (
                  <p className="line-clamp-2 text-foreground/70">{p.description}</p>
                )}
                {p.assignedTo && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {p.assignedTo}
                  </div>
                )}
                {p.budget && (
                  <div className="flex items-center gap-1.5 text-primary font-semibold">
                    <Banknote className="h-3.5 w-3.5" />
                    {GHS(p.budget)}
                  </div>
                )}
                {(p.startDate || p.endDate) && (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {p.startDate ? format(new Date(p.startDate), "dd MMM yy") : "—"} →{" "}
                    {p.endDate ? format(new Date(p.endDate), "dd MMM yy") : "—"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProjectForm
              initial={editing}
              onSave={(d) => updateMut.mutate({ ...d, id: editing.id })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the project and all its tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
