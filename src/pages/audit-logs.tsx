import { useState } from "react";
import {
  useGetAuditLogs,
  getGetAuditLogsQueryKey,
  customFetch,
} from "@/workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Trash2, Loader2, CheckSquare2, Square, ArchiveX } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditLog = {
  id: number;
  userId?: number;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: string;
  ipAddress: string;
  userAgent?: string;
  createdAt: string;
};

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | "all">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = {
    page,
    limit: 20,
    action: action !== "all" ? action : undefined,
  };

  const { data: logsResponse, isLoading } = useGetAuditLogs(queryParams, {
    query: { queryKey: getGetAuditLogsQueryKey(queryParams) },
  });

  const logs: AuditLog[] = (logsResponse?.data ?? []) as AuditLog[];
  const allIds = logs.map((l) => l.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const n = new Set(prev);
        allIds.forEach((id) => n.delete(id));
        return n;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allIds]));
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetAuditLogsQueryKey(queryParams) });
    queryClient.invalidateQueries({ queryKey: ["system-info"] });
  };

  const purgeToBin = async (ids?: number[]) => {
    setPurging(true);
    try {
      const body = ids ? { ids } : {};
      const result = await customFetch<{ message: string; count: number }>(
        "/api/admin/audit-logs/purge-to-bin",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      toast({ title: "Moved to Recycle Bin", description: result.message });
      setSelected(new Set());
      setPurgeDialogOpen(false);
      invalidate();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Purge failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setPurging(false);
    }
  };

  const getActionColor = (actionName: string) => {
    if (actionName.includes("CREATE") || actionName.includes("LOGIN"))
      return "bg-green-500/10 text-green-700 hover:bg-green-500/20";
    if (
      actionName.includes("DELETE") ||
      actionName.includes("FAIL") ||
      actionName.includes("PURGE")
    )
      return "bg-red-500/10 text-red-700 hover:bg-red-500/20";
    if (actionName.includes("UPDATE")) return "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20";
    return "bg-secondary text-secondary-foreground";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Audit Tray</h2>
        <p className="text-muted-foreground">
          System-wide activity and security events (Admin Only).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Security Trail
              {logsResponse && (
                <Badge variant="outline" className="font-normal text-xs ml-1">
                  {logsResponse.total.toLocaleString()} entries
                </Badge>
              )}
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              {someSelected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-9 gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
                  disabled={purging}
                  onClick={() => purgeToBin([...selected])}
                >
                  {purging ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArchiveX className="h-3.5 w-3.5" />
                  )}
                  Move {selected.size} to Recycle Bin
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-9 gap-1.5 border-red-400/60 text-red-700 hover:bg-red-50"
                disabled={purging || !logsResponse || logsResponse.total === 0}
                onClick={() => setPurgeDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Purge All to Recycle Bin
              </Button>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  setPage(1);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger className="w-[160px] rounded-full h-9">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="LOGIN">Logins</SelectItem>
                  <SelectItem value="CREATE">Creates</SelectItem>
                  <SelectItem value="UPDATE">Updates</SelectItem>
                  <SelectItem value="DELETE">Deletes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {someSelected && (
            <div className="mt-2 px-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckSquare2 className="h-3.5 w-3.5 text-primary" />
              <span>
                {selected.size} row{selected.size !== 1 ? "s" : ""} selected
              </span>
              <button
                className="text-primary hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-10 px-3">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title={allSelected ? "Deselect all on page" : "Select all on page"}
                  >
                    {allSelected ? (
                      <CheckSquare2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="w-[160px]">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-3">
                      <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    No audit logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isChecked = selected.has(log.id);
                  return (
                    <TableRow
                      key={log.id}
                      className={cn(
                        "text-sm cursor-pointer select-none",
                        isChecked && "bg-primary/5",
                      )}
                      onClick={() => toggleOne(log.id)}
                    >
                      <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleOne(log.id)}
                          className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare2 className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{log.userName || "System"}</div>
                        <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`border-0 font-mono text-[10px] uppercase ${getActionColor(log.action)}`}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{log.resource}</div>
                        {log.resourceId && (
                          <div className="text-xs text-muted-foreground font-mono">
                            ID: {log.resourceId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.ipAddress}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {logsResponse && logsResponse.total > logsResponse.limit && (
          <div className="p-4 border-t flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * logsResponse.limit + 1}–
              {Math.min(page * logsResponse.limit, logsResponse.total)} of {logsResponse.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page * logsResponse.limit >= logsResponse.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={purgeDialogOpen}
        onOpenChange={(v) => {
          if (!purging) setPurgeDialogOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" /> Purge All Audit Logs
            </DialogTitle>
            <DialogDescription>
              All {logsResponse?.total?.toLocaleString() ?? ""} audit log entries will be moved to
              the Recycle Bin. You can review or permanently delete them from there.
              <br />
              <br />
              <span className="text-amber-700 font-medium">
                This clears the entire audit trail, not just the current page.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={purging}
              onClick={() => setPurgeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-full gap-2"
              disabled={purging}
              onClick={() => purgeToBin()}
            >
              {purging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Yes, Move to Recycle Bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
