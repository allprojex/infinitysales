// Product bulk upload dialog used on the Inventory (Products) page.
// Wraps the existing /api/products/import/{preview,commit} endpoints with a
// review UI that supports per-row edit / approve / delete and bulk actions.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, XCircle,
  ArrowLeft, Download, Pencil, Trash2, Sparkles, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type ImportMode = "insert" | "update" | "upsert";

interface NormalizedProductRow {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  price: string | null;
  cost: string | null;
  stock: number;
  unit: string | null;
  description: string | null;
  reorderPoint: number;
  imageUrl: string | null;
  supplier: string | null;
  taxInfo: string | null;
  expiryDate: string | null;
  batchLotNumber: string | null;
}

interface PreviewRow {
  rowNum: number;
  status: "ok" | "warning" | "error";
  errors: string[];
  warnings: string[];
  matchedExistingId: string | null;
  prevValues: Record<string, unknown> | null;
  data: NormalizedProductRow;
}

interface PreviewResponse {
  batchId: string;
  fileName: string;
  fileWarnings: string[];
  templateVersionWarning: string | null;
  importMode: ImportMode;
  rows: PreviewRow[];
  summary: { total: number; ok: number; warnings: number; errors: number; updates: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = [".csv", ".xlsx"];
const ACCEPT = ALLOWED_EXTS.join(",");

const EDITABLE_FIELDS: { key: keyof NormalizedProductRow; label: string; type?: "number" | "date" }[] = [
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode / QR" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit of measure" },
  { key: "cost", label: "Purchase price", type: "number" },
  { key: "price", label: "Selling price", type: "number" },
  { key: "stock", label: "Stock quantity", type: "number" },
  { key: "reorderPoint", label: "Reorder point", type: "number" },
  { key: "expiryDate", label: "Expiry date", type: "date" },
  { key: "batchLotNumber", label: "Batch / lot number" },
  { key: "description", label: "Description" },
];

function authHeaders(): HeadersInit {
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProductBulkUploadDialog({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"pick" | "review" | "done">("pick");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("upsert");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  // Per-row state. Each row can be: approved (checked), edited (overrides), or deleted (removed from selectedRows).
  const [approvedRows, setApprovedRows] = useState<Set<number>>(new Set());
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Map<number, Partial<NormalizedProductRow>>>(new Map());
  const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [bulkPanel, setBulkPanel] = useState<"none" | "set" | "replace">("none");
  const [bulkField, setBulkField] = useState<keyof NormalizedProductRow>("category");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSearch, setBulkSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "errors" | "updates" | "new">("all");
  const [commitResult, setCommitResult] = useState<{ importedCount: number; updatedCount: number; errors: string[] } | null>(null);

  const reset = () => {
    setStep("pick"); setBusy(false); setFile(null); setPreview(null);
    setApprovedRows(new Set()); setDeletedRows(new Set()); setEdits(new Map());
    setSelectedForBulk(new Set()); setEditingRow(null); setBulkPanel("none");
    setBulkField("category"); setBulkValue(""); setBulkSearch(""); setFilter("all");
    setCommitResult(null);
  };
  const handleClose = () => { if (!busy) { reset(); onClose(); } };

  // ── File pick ────────────────────────────────────────────────────────────
  const addFile = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!ext || !ALLOWED_EXTS.includes(ext)) {
      toast({ variant: "destructive", title: "Unsupported file", description: `Use ${ALLOWED_EXTS.join(" or ")}` });
      return;
    }
    setFile(f);
  };

  const runPreview = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("importMode", importMode);
      const res = await fetch("/api/products/import/preview", { method: "POST", body: fd, headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Preview failed");
      setPreview(data as PreviewResponse);
      // Approve all valid rows by default.
      const ok = new Set<number>();
      for (const r of (data as PreviewResponse).rows) if (r.status !== "error") ok.add(r.rowNum);
      setApprovedRows(ok);
      setStep("review");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Preview failed", description: e?.message ?? "Unknown error" });
    } finally { setBusy(false); }
  };

  // Re-run preview when import mode changes.
  useEffect(() => {
    if (step === "review" && file && !busy) runPreview();
     
  }, [importMode]);

  // ── Row helpers ──────────────────────────────────────────────────────────
  const getRowValue = (row: PreviewRow, field: keyof NormalizedProductRow) => {
    const override = edits.get(row.rowNum)?.[field];
    return override !== undefined ? override : row.data[field];
  };

  const updateRowField = (rowNum: number, field: keyof NormalizedProductRow, value: any) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(rowNum) ?? {};
      next.set(rowNum, { ...current, [field]: value === "" ? null : value });
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => {
      if (deletedRows.has(r.rowNum)) return false;
      if (filter === "errors") return r.status === "error";
      if (filter === "updates") return r.matchedExistingId !== null;
      if (filter === "new") return r.matchedExistingId === null;
      return true;
    });
  }, [preview, filter, deletedRows]);


  const toggleBulk = (rowNum: number) => setSelectedForBulk((prev) => {
    const next = new Set(prev);
    next.has(rowNum) ? next.delete(rowNum) : next.add(rowNum);
    return next;
  });

  const bulkSelectAll = () => setSelectedForBulk(new Set(visibleRows.map((r) => r.rowNum)));
  const bulkClear = () => setSelectedForBulk(new Set());

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const applyBulkApprove = (approve: boolean) => {
    setApprovedRows((prev) => {
      const next = new Set(prev);
      for (const n of selectedForBulk) approve ? next.add(n) : next.delete(n);
      return next;
    });
  };

  const applyBulkDelete = () => {
    setDeletedRows((prev) => {
      const next = new Set(prev);
      for (const n of selectedForBulk) next.add(n);
      return next;
    });
    setApprovedRows((prev) => {
      const next = new Set(prev);
      for (const n of selectedForBulk) next.delete(n);
      return next;
    });
    setSelectedForBulk(new Set());
  };

  const applyBulkSet = () => {
    if (!preview) return;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const n of selectedForBulk) {
        const cur = next.get(n) ?? {};
        next.set(n, { ...cur, [bulkField]: bulkValue === "" ? null : bulkValue });
      }
      return next;
    });
    setBulkValue(""); setBulkPanel("none");
    toast({ title: `Updated ${selectedForBulk.size} row(s)`, description: `Set ${bulkField} on selected rows.` });
  };

  const applyBulkReplace = () => {
    if (!preview || !bulkSearch) return;
    let touched = 0;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const n of selectedForBulk) {
        const row = preview.rows.find((r) => r.rowNum === n);
        if (!row) continue;
        const cur = String(getRowValue(row, bulkField) ?? "");
        if (cur.includes(bulkSearch)) {
          const replaced = cur.split(bulkSearch).join(bulkValue);
          const merged = next.get(n) ?? {};
          next.set(n, { ...merged, [bulkField]: replaced || null });
          touched += 1;
        }
      }
      return next;
    });
    setBulkPanel("none"); setBulkSearch(""); setBulkValue("");
    toast({ title: `Replaced in ${touched} row(s)`, description: touched ? `${bulkField} updated.` : "No matches found." });
  };

  // ── Commit ───────────────────────────────────────────────────────────────
  const commit = async () => {
    if (!preview || busy) return;
    const selectedRowNums: number[] = [];
    const rowOverrides: Record<string, Partial<NormalizedProductRow>> = {};
    for (const r of preview.rows) {
      if (deletedRows.has(r.rowNum)) continue;
      if (!approvedRows.has(r.rowNum)) continue;
      selectedRowNums.push(r.rowNum);
      const e = edits.get(r.rowNum);
      if (e && Object.keys(e).length) rowOverrides[String(r.rowNum)] = e;
    }
    if (!selectedRowNums.length) {
      toast({ variant: "destructive", title: "Nothing to import", description: "Approve at least one row first." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ batchId: preview.batchId, selectedRowNums, rowOverrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Import failed");
      setCommitResult({
        importedCount: data.importedCount ?? 0,
        updatedCount: data.updatedCount ?? 0,
        errors: data.errors ?? [],
      });
      setStep("done");
      onSuccess();
      toast({
        title: "Import complete",
        description: `${data.importedCount} added, ${data.updatedCount} updated${data.errors?.length ? `, ${data.errors.length} failed` : ""}.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Commit failed", description: e?.message ?? "Unknown error" });
    } finally { setBusy(false); }
  };

  // ── Derived counts ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!preview) return { total: 0, approved: 0, deleted: 0, edited: 0, willInsert: 0, willUpdate: 0 };
    let willInsert = 0, willUpdate = 0;
    for (const r of preview.rows) {
      if (deletedRows.has(r.rowNum) || !approvedRows.has(r.rowNum)) continue;
      if (r.matchedExistingId && importMode !== "insert") willUpdate += 1; else willInsert += 1;
    }
    return {
      total: preview.rows.length,
      approved: approvedRows.size,
      deleted: deletedRows.size,
      edited: edits.size,
      willInsert, willUpdate,
    };
  }, [preview, approvedRows, deletedRows, edits, importMode]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[1000px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Bulk upload products
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {step === "pick" ? "Step 1 — Choose file" : step === "review" ? "Step 2 — Review & approve" : "Step 3 — Result"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file. Matched products (by SKU) will be updated; new rows will be added.
            Missing fields are saved as blank.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-4">
            <div
              role="button" tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFile(e.dataTransfer.files?.[0]); }}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none",
                dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/60 hover:bg-muted/20",
              )}
            >
              <Upload className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">Drop a file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1.5">CSV · Excel (.xlsx) · max 5 MB</p>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>

            {file && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-muted/20">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Import mode</label>
                <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                  <SelectTrigger className="rounded-[20px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">Add new & update existing (recommended)</SelectItem>
                    <SelectItem value="insert">Only add new — fail if SKU exists</SelectItem>
                    <SelectItem value="update">Only update existing matched SKUs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Need a template?</label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5 flex-1" asChild>
                    <a href="/api/products/import-template?format=csv" download><Download className="h-3.5 w-3.5" /> CSV template</a>
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5 flex-1" asChild>
                    <a href="/api/products/import-template?format=xlsx" download><Download className="h-3.5 w-3.5" /> Excel template</a>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={handleClose}>Cancel</Button>
              <Button className="rounded-full gap-2" disabled={!file || busy} onClick={runPreview}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Validating…" : "Preview & review"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && preview && (
          <div className="space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
              <Stat label="Rows" value={totals.total} />
              <Stat label="Approved" value={totals.approved} tone="success" />
              <Stat label="Will insert" value={totals.willInsert} tone="success" />
              <Stat label="Will update" value={totals.willUpdate} tone="info" />
              <Stat label="Edited" value={totals.edited} tone="warning" />
              <Stat label="Deleted" value={totals.deleted} tone="error" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border bg-muted/20">
              <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                <SelectTrigger className="h-8 w-[140px] rounded-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rows</SelectItem>
                  <SelectItem value="errors">Errors only</SelectItem>
                  <SelectItem value="updates">Updates only</SelectItem>
                  <SelectItem value="new">New only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                <SelectTrigger className="h-8 w-[180px] rounded-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">Add & update</SelectItem>
                  <SelectItem value="insert">Add only</SelectItem>
                  <SelectItem value="update">Update only</SelectItem>
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border mx-1" />
              <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={bulkSelectAll}>Select visible</Button>
              <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={bulkClear} disabled={!selectedForBulk.size}>Clear</Button>
              {selectedForBulk.size > 0 && (
                <>
                  <span className="text-[11px] text-muted-foreground">{selectedForBulk.size} selected</span>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1" onClick={() => applyBulkApprove(true)}><CheckCircle2 className="h-3 w-3" /> Approve</Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1" onClick={() => applyBulkApprove(false)}><XCircle className="h-3 w-3" /> Unapprove</Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1 text-destructive" onClick={applyBulkDelete}><Trash2 className="h-3 w-3" /> Delete</Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1" onClick={() => setBulkPanel(bulkPanel === "set" ? "none" : "set")}><Pencil className="h-3 w-3" /> Set field</Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1" onClick={() => setBulkPanel(bulkPanel === "replace" ? "none" : "replace")}><Search className="h-3 w-3" /> Find & replace</Button>
                </>
              )}
            </div>

            {/* Bulk edit panel */}
            {bulkPanel !== "none" && (
              <div className="flex flex-wrap items-end gap-2 p-2 rounded-xl border bg-amber-50/30 dark:bg-amber-950/10">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Field</label>
                  <Select value={bulkField} onValueChange={(v) => setBulkField(v as any)}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EDITABLE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {bulkPanel === "replace" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Find</label>
                    <Input className="h-8 rounded-full text-xs w-[140px]" value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)} placeholder="Search text" />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">{bulkPanel === "set" ? "Set value to" : "Replace with"}</label>
                  <Input className="h-8 rounded-full text-xs w-[160px]" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="(blank to clear)" />
                </div>
                <Button size="sm" className="h-8 rounded-full" onClick={bulkPanel === "set" ? applyBulkSet : applyBulkReplace}>
                  Apply to {selectedForBulk.size} row{selectedForBulk.size !== 1 ? "s" : ""}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setBulkPanel("none")}>Close</Button>
              </div>
            )}

            {preview.fileWarnings.map((w, i) => (
              <div key={i} className="text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/40">{w}</div>
            ))}

            {/* Rows */}
            <div className="rounded-xl border overflow-hidden">
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {visibleRows.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted-foreground">No rows to show.</div>}
                {visibleRows.slice(0, 200).map((row) => (
                  <ReviewRow
                    key={row.rowNum}
                    row={row}
                    approved={approvedRows.has(row.rowNum)}
                    selected={selectedForBulk.has(row.rowNum)}
                    isEditing={editingRow === row.rowNum}
                    edits={edits.get(row.rowNum)}
                    onToggleSelect={() => toggleBulk(row.rowNum)}
                    onToggleApprove={(v) => setApprovedRows((prev) => {
                      const next = new Set(prev); v ? next.add(row.rowNum) : next.delete(row.rowNum); return next;
                    })}
                    onDelete={() => {
                      setDeletedRows((prev) => new Set(prev).add(row.rowNum));
                      setApprovedRows((prev) => { const next = new Set(prev); next.delete(row.rowNum); return next; });
                    }}
                    onEdit={() => setEditingRow(editingRow === row.rowNum ? null : row.rowNum)}
                    onChange={(field, value) => updateRowField(row.rowNum, field, value)}
                  />
                ))}
                {visibleRows.length > 200 && (
                  <div className="px-3 py-2 text-[11px] text-center text-muted-foreground italic">
                    Showing first 200 rows. All approved rows will be imported.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setStep("pick")} disabled={busy}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-full" onClick={handleClose} disabled={busy}>Cancel</Button>
                <Button className="rounded-full gap-2" disabled={busy || totals.approved === 0} onClick={commit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busy ? "Importing…" : `Approve & import ${totals.approved} row${totals.approved !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && commitResult && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-5 flex-wrap text-sm font-medium">
                <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {commitResult.importedCount} added</span>
                <span className="flex items-center gap-1.5 text-blue-700"><CheckCircle2 className="h-4 w-4" /> {commitResult.updatedCount} updated</span>
                {commitResult.errors.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-700"><AlertCircle className="h-4 w-4" /> {commitResult.errors.length} failed</span>
                )}
              </div>
              {commitResult.errors.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {commitResult.errors.map((m, i) => (
                    <div key={i} className="text-xs rounded px-2.5 py-1.5 font-mono leading-relaxed bg-red-50 text-red-700 border border-red-200">{m}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => reset()}>Upload another</Button>
              <Button size="sm" className="rounded-full" onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "info" | "warning" | "error" }) {
  const cls = tone === "success" ? "border-emerald-200 bg-emerald-50/50 text-emerald-700"
    : tone === "info" ? "border-blue-200 bg-blue-50/50 text-blue-700"
    : tone === "warning" ? "border-amber-200 bg-amber-50/50 text-amber-700"
    : tone === "error" ? "border-red-200 bg-red-50/50 text-red-700"
    : "border-border bg-muted/20 text-foreground";
  return (
    <div className={cn("rounded-lg border px-3 py-2", cls)}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-semibold leading-tight">{value}</div>
    </div>
  );
}

function ReviewRow({
  row, approved, selected, isEditing, edits, onToggleSelect, onToggleApprove, onDelete, onEdit, onChange,
}: {
  row: PreviewRow;
  approved: boolean;
  selected: boolean;
  isEditing: boolean;
  edits?: Partial<NormalizedProductRow>;
  onToggleSelect: () => void;
  onToggleApprove: (v: boolean) => void;
  onDelete: () => void;
  onEdit: () => void;
  onChange: (field: keyof NormalizedProductRow, value: any) => void;
}) {
  const isError = row.status === "error";
  const isWarn = row.status === "warning";
  const tone = isError ? "bg-red-50/30 dark:bg-red-950/10"
    : isWarn ? "bg-amber-50/30 dark:bg-amber-950/10" : "";
  const get = (k: keyof NormalizedProductRow) => (edits?.[k] !== undefined ? edits[k] : row.data[k]);

  return (
    <div className={cn("px-3 py-2 text-xs", tone)}>
      <div className="flex items-start gap-2">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5" />
        <Checkbox checked={approved} onCheckedChange={(v) => onToggleApprove(!!v)} className="mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">row {row.rowNum}</span>
            {row.matchedExistingId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">UPDATE existing</span>
            )}
            {!row.matchedExistingId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">NEW</span>
            )}
            {edits && Object.keys(edits).length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">edited</span>
            )}
            <span className="font-medium truncate">{String(get("name") ?? "(no name)")}</span>
            {get("sku") && <span className="text-muted-foreground font-mono">· {String(get("sku"))}</span>}
          </div>

          {!isEditing && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {EDITABLE_FIELDS.filter((f) => f.key !== "name" && f.key !== "sku").map((f) => {
                const v = get(f.key);
                if (v === null || v === undefined || v === "") return null;
                return <span key={f.key}><span className="opacity-60">{f.label}:</span> <span className="text-foreground">{String(v)}</span></span>;
              })}
            </div>
          )}

          {isEditing && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {EDITABLE_FIELDS.map((f) => (
                <div key={f.key} className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">{f.label}</label>
                  <Input
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    className="h-7 text-xs rounded-md"
                    value={String(get(f.key) ?? "")}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {row.errors.map((e, i) => <div key={`e-${i}`} className="text-red-700 mt-0.5">• {e}</div>)}
          {row.warnings.map((w, i) => <div key={`w-${i}`} className="text-amber-700 mt-0.5">• {w}</div>)}
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title={isEditing ? "Done" : "Edit"}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={onDelete} title="Delete row">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
