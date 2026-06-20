import { useListBackups, useCreateBackup, getListBackupsQueryKey } from "@/workspace/api-client-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Loader2, HardDrive, Upload, RotateCcw, FolderArchive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Backup() {
  const { data: backups, isLoading } = useListBackups();
  const createBackupMutation = useCreateBackup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tableFileRef = useRef<HTMLInputElement>(null);
  const storageFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListBackupsQueryKey() });

  const handleCreate = () => {
    createBackupMutation.mutate(undefined, {
      onSuccess: () => { toast({ title: "Backup created successfully" }); refresh(); },
      onError: (error) => toast({ variant: "destructive", title: "Failed to create backup", description: error.message }),
    });
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      const res = await fetch(`/api/admin/backup/${id}/download`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ variant: "destructive", title: "Download failed", description: e instanceof Error ? e.message : "Could not download backup" });
    }
  };

  const handleRestore = async (id: number, filename: string) => {
    if (!window.confirm(`Restore tables from "${filename}"?\n\nExisting rows with matching IDs will be kept; new rows from the backup will be inserted (merge mode).`)) return;
    setRestoringId(id);
    try {
      const res = await fetch(`/api/admin/backup/${id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ mode: "merge" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      toast({ title: "Restore complete", description: `${body.rowsRestored ?? 0} row(s) across ${body.tablesRestored?.length ?? 0} table(s).` });
    } catch (e) {
      toast({ variant: "destructive", title: "Restore failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setRestoringId(null); }
  };

  const handleImportTables = async (file: File) => {
    setBusy("import-tables");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/backup/upload", { method: "POST", headers: authHeaders(), body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      toast({ title: "Backup file imported", description: `${body.totalRows ?? 0} row(s) across ${body.detectedTables?.length ?? 0} table(s). Use Restore to apply.` });
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Import failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setBusy(null); if (tableFileRef.current) tableFileRef.current.value = ""; }
  };

  const handleExportStorage = async () => {
    setBusy("export-storage");
    try {
      const res = await fetch("/api/admin/backup/storage", { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storage-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Storage backup downloaded" });
    } catch (e) {
      toast({ variant: "destructive", title: "Storage export failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setBusy(null); }
  };

  const handleImportStorage = async (file: File) => {
    if (!window.confirm(`Import "${file.name}" into storage?\n\nFiles in the zip will overwrite existing files with the same path.`)) return;
    setBusy("import-storage");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/backup/storage", { method: "POST", headers: authHeaders(), body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      toast({
        title: "Storage import complete",
        description: `Uploaded ${body.uploaded} file(s)${body.errors?.length ? `, ${body.errors.length} error(s)` : ""}.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Storage import failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setBusy(null); if (storageFileRef.current) storageFileRef.current.value = ""; }
  };

  const formatBytes = (bytes: number | undefined) => {
    if (!bytes) return "Unknown";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Backup &amp; Restore</h2>
          <p className="text-muted-foreground">Export and import database tables and storage files (Admin only).</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Database tables */}
        <Card className="border-transparent shadow-md">
          <CardHeader className="bg-primary/5 border-b pb-4">
            <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" />Database Tables</CardTitle>
            <CardDescription>Snapshot or import your business tables.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex flex-wrap gap-2">
            <Button onClick={handleCreate} disabled={createBackupMutation.isPending} className="gap-2">
              {createBackupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Create Snapshot
            </Button>
            <input ref={tableFileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportTables(f); }} />
            <Button variant="outline" className="gap-2" disabled={busy === "import-tables"}
              onClick={() => tableFileRef.current?.click()}>
              {busy === "import-tables" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import JSON
            </Button>
          </CardContent>
        </Card>

        {/* Storage files */}
        <Card className="border-transparent shadow-md">
          <CardHeader className="bg-primary/5 border-b pb-4">
            <CardTitle className="flex items-center gap-2"><FolderArchive className="h-5 w-5 text-primary" />Storage Files</CardTitle>
            <CardDescription>Export or import all files across storage buckets.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex flex-wrap gap-2">
            <Button onClick={handleExportStorage} disabled={busy === "export-storage"} className="gap-2">
              {busy === "export-storage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export ZIP
            </Button>
            <input ref={storageFileRef} type="file" accept=".zip,application/zip" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportStorage(f); }} />
            <Button variant="outline" className="gap-2" disabled={busy === "import-storage"}
              onClick={() => storageFileRef.current?.click()}>
              {busy === "import-storage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import ZIP
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-transparent shadow-md">
        <CardHeader className="bg-primary/5 border-b pb-4">
          <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" />Backup History</CardTitle>
          <CardDescription>Download or restore any saved snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Tables / Rows</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                  </TableRow>
                ))
              ) : backups?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No backups yet. Create a snapshot or import a JSON file.
                  </TableCell>
                </TableRow>
              ) : (
                backups?.map((backup: any) => (
                  <TableRow key={backup.id}>
                    <TableCell className="font-mono text-xs sm:text-sm break-all">{backup.filename}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(backup.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatBytes(backup.size ?? backup.sizeBytes)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {backup.tableCount ?? backup.tables?.length ?? 0} / {backup.rowCount ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="rounded-full"
                          onClick={() => handleDownload(backup.id, backup.filename)} title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="rounded-full"
                          disabled={restoringId === backup.id}
                          onClick={() => handleRestore(backup.id, backup.filename)} title="Restore">
                          {restoringId === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                      </div>
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
