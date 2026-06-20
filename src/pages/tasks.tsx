import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare, Plus, MoreVertical, Pencil, Trash2, Loader2, User, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Task = { id: number; projectId: number; title: string; description: string | null; status: string; priority: string; assignedTo: string | null; dueDate: string | null; createdAt: string };
type Project = { id: number; name: string };

const statusColors: Record<string, string> = { todo: "bg-slate-100 text-slate-600", in_progress: "bg-blue-100 text-blue-700", done: "bg-green-100 text-green-700", blocked: "bg-red-100 text-red-700" };
const priorityColors: Record<string, string> = { low: "bg-slate-100 text-slate-500", medium: "bg-blue-100 text-blue-600", high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700" };

function TaskForm({ initial, projects, onSave, onCancel, isPending }: { initial?: Partial<Task>; projects: Project[]; onSave: (d: Partial<Task>) => void; onCancel: () => void; isPending: boolean }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "todo");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [projectId, setProjectId] = useState(String(initial?.projectId ?? ""));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    onSave({ title, description: description || null, status, priority, assignedTo: assignedTo || null, dueDate: dueDate || null, projectId: Number(projectId) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div>
        <label className="text-xs font-medium">Project *</label>
        <Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="rounded-[20px] mt-1"><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div>
        <label className="text-xs font-medium">Task Title *</label>
        <Input id="task-title" name="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task description" className="rounded-[20px] mt-1" />
      </div>
      <div>
        <label className="text-xs font-medium">Details</label>
        <Textarea id="task-description" name="description" value={description} onChange={e => setDescription(e.target.value)} className="rounded-[20px] mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="rounded-[20px] mt-1"><SelectValue /></SelectTrigger><SelectContent>{["todo","in_progress","done","blocked"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <label className="text-xs font-medium">Priority</label>
          <Select value={priority} onValueChange={setPriority}><SelectTrigger className="rounded-[20px] mt-1"><SelectValue /></SelectTrigger><SelectContent>{["low","medium","high","urgent"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <label className="text-xs font-medium">Assigned To</label>
          <Input id="task-assigned-to" name="assignedTo" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or team" className="rounded-[20px] mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium">Due Date</label>
          <Input id="task-due-date" name="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-[20px] mt-1" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="rounded-full" disabled={isPending || !title.trim() || !projectId}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{initial?.id ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );
}

export default function Tasks() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");

  const { data: projectsData } = useQuery<{ data: Project[] }>({ queryKey: ["projects"], queryFn: () => customFetch("/api/projects?limit=100") });
  const projects = projectsData?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const fetchTasks = async () => {
    if (selectedProject !== "all") {
      const data = await customFetch<Task[]>(`/api/projects/${selectedProject}/tasks`);
      return { data: Array.isArray(data) ? data : [], total: Array.isArray(data) ? data.length : 0 };
    }
    const allTasks: Task[] = [];
    await Promise.all(projects.map(async p => {
      try { const t = await customFetch<Task[]>(`/api/projects/${p.id}/tasks`); if (Array.isArray(t)) allTasks.push(...t); } catch { /* ignore */ }
    }));
    return { data: allTasks, total: allTasks.length };
  };

  const { data, isLoading } = useQuery<{ data: Task[]; total: number }>({
    queryKey: ["tasks", selectedProject, statusFilter],
    queryFn: fetchTasks,
    enabled: true,
  });

  const createMut = useMutation({
    mutationFn: ({ projectId: pid, ...d }: Partial<Task> & { projectId: number }) => customFetch(`/api/projects/${pid}/tasks`, { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { toast({ title: "Task created" }); setCreating(false); invalidate(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Task> & { id: number }) => customFetch(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => { toast({ title: "Task updated" }); setEditing(null); invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Task deleted" }); setDeletingId(null); invalidate(); },
  });

  let tasks = data?.data ?? [];
  if (statusFilter !== "all") tasks = tasks.filter(t => t.status === statusFilter);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground">Manage team tasks, assignments, and deadlines.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="rounded-full w-40"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-full w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Status</SelectItem>{["todo","in_progress","done","blocked"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild><Button className="rounded-full gap-2" disabled={!projects.length}><Plus className="h-4 w-4" />New Task</Button></DialogTrigger>
            <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader><TaskForm projects={projects} onSave={d => createMut.mutate(d as Partial<Task> & { projectId: number })} onCancel={() => setCreating(false)} isPending={createMut.isPending} /></DialogContent>
          </Dialog>
        </div>
      </div>

      {!projects.length && (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Create a project first before adding tasks.</p></CardContent></Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Assigned To</TableHead><TableHead>Due Date</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
              <TableBody>
                {!tasks.length
                  ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />No tasks found</TableCell></TableRow>
                  : tasks.map(t => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{t.title}</p>
                        {t.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{projectMap[t.projectId] ?? `Project #${t.projectId}`}</TableCell>
                      <TableCell><Badge className={`${statusColors[t.status] ?? ""} border-0 text-[10px] capitalize`}>{t.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell><Badge className={`${priorityColors[t.priority] ?? ""} border-0 text-[10px] capitalize`}>{t.priority}</Badge></TableCell>
                      <TableCell className="text-xs">{t.assignedTo ? <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.assignedTo}</span> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.dueDate ? <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(t.dueDate), "dd MMM yyyy")}</span> : "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(t)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(t.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>{editing && <TaskForm initial={editing} projects={projects} onSave={d => updateMut.mutate({ ...d, id: editing.id } as Partial<Task> & { id: number })} onCancel={() => setEditing(null)} isPending={updateMut.isPending} />}</DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={o => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete task?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the task.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMut.mutate(deletingId)} disabled={deleteMut.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
