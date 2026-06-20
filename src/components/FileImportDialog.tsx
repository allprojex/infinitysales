import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Eye,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type ImportType = "sales" | "purchases";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  blocked: string[];
  message: string;
}

interface PreviewRow {
  file: string;
  rowNum: number;
  raw: Record<string, string>;
  mapped: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  action: "insert" | "skip";
}

interface FilePreview {
  file: string;
  headers: string[];
  unmappedHeaders: string[];
  fileWarnings: string[];
  rowCount: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  rows: PreviewRow[];
}

interface PreviewResponse {
  type: string;
  supported: boolean;
  totals: { rows: number; valid: number; errors: number; warnings: number; files: number };
  files: FilePreview[];
  message: string;
}

interface Props {
  type: ImportType;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = [".csv", ".xlsx"];
const ACCEPT = ALLOWED_EXTS.join(",");

const TEMPLATES: Record<ImportType, string> = {
  sales: [
    "order_ref,customer_name,customer_email,product_name,quantity,unit_price,tax,status,date,notes",
    "ORD-001,John Doe,john@example.com,Widget A,2,15.00,5.00,completed,2025-01-01,Bulk order",
    "ORD-001,John Doe,john@example.com,Widget B,1,8.50,0,completed,2025-01-01,Bulk order",
    "ORD-002,Jane Smith,jane@company.com,Widget C,3,12.00,0,pending,2025-01-02,",
  ].join("\n"),
  purchases: [
    "order_ref,supplier,product_name,sku,quantity,unit_cost,expected_date,status,notes",
    "PO-001,Acme Corp,Widget A,SKU-A,10,20.00,2025-01-15,ordered,Restocking",
    "PO-001,Acme Corp,Widget B,SKU-B,5,15.00,2025-01-15,ordered,",
    "PO-002,Global Supplies,Widget C,SKU-C,20,12.50,2025-01-20,draft,",
  ].join("\n"),
};

const COLUMN_GUIDE: Record<ImportType, { col: string; description: string; required: boolean }[]> = {
  sales: [
    { col: "order_ref", description: "Groups multiple rows into one sale", required: false },
    { col: "customer_name", description: "Required if customer_email is missing", required: false },
    { col: "customer_email", description: "Must be a valid email address", required: false },
    { col: "product_name", description: "Looked up in catalogue; missing items keep the typed name", required: true },
    { col: "quantity", description: "Whole number greater than 0", required: true },
    { col: "unit_price", description: "Optional — falls back to catalogue price", required: false },
    { col: "tax", description: "Tax amount for the whole order (first row)", required: false },
    { col: "status", description: "pending · completed · cancelled · refunded", required: false },
    { col: "date", description: "YYYY-MM-DD", required: false },
    { col: "notes", description: "Free-form notes", required: false },
  ],
  purchases: [
    { col: "order_ref", description: "Groups multiple rows into one purchase order", required: true },
    { col: "supplier", description: "Created automatically if it doesn't exist yet", required: false },
    { col: "product_name", description: "Catalogue name for the line item", required: true },
    { col: "sku", description: "Optional SKU reference", required: false },
    { col: "quantity", description: "Whole number greater than 0", required: true },
    { col: "unit_cost", description: "Plain decimal — no commas (e.g. 1500.00)", required: true },
    { col: "expected_date", description: "YYYY-MM-DD", required: false },
    { col: "status", description: "draft · ordered · pending · received · cancelled", required: false },
    { col: "notes", description: "Free-form notes", required: false },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadTemplate(type: ImportType) {
  const blob = new Blob([TEMPLATES[type]], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}-import-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getExtBadgeColor(name: string): string {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (ext === ".csv") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (ext === ".xlsx" || ext === ".xls") return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  return "bg-gray-100 text-gray-700";
}

function authHeaders(): HeadersInit {
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = "pick" | "preview" | "done";

export function FileImportDialog({ type, open, onClose, onSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [errorsOnly, setErrorsOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const label = type === "sales" ? "Sales" : "Purchase Orders";

  const reset = () => {
    setFiles([]);
    setPreview(null);
    setResult(null);
    setShowGuide(false);
    setStep("pick");
    setExpandedFiles(new Set());
    setErrorsOnly(false);
  };

  const handleClose = () => {
    if (!busy) { reset(); onClose(); }
  };

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => {
      const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      return ext && ALLOWED_EXTS.includes(ext);
    });
    const invalid = incoming.length - valid.length;
    if (invalid > 0) {
      toast({
        variant: "destructive",
        title: "Some files skipped",
        description: `${invalid} file(s) have unsupported formats. Accepted: ${ALLOWED_EXTS.join(", ")}`,
      });
    }
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existing.has(f.name))];
    });
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const runPreview = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/import/${type}/preview`, {
        method: "POST", body: fd, headers: authHeaders(),
      });
      const data: PreviewResponse = await res.json();
      if (!res.ok) throw new Error((data as any)?.message ?? "Preview failed");
      setPreview(data);
      setStep("preview");
      // Auto-expand files with errors
      const toExpand = new Set<string>();
      for (const f of data.files) if (f.errorCount > 0) toExpand.add(f.file);
      if (!toExpand.size && data.files[0]) toExpand.add(data.files[0].file);
      setExpandedFiles(toExpand);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Preview failed", description: e?.message ?? "Unknown error" });
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!files.length || busy) return;
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/import/${type}`, {
        method: "POST", body: fd, headers: authHeaders(),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) throw new Error((data as any)?.error ?? (data as any)?.message ?? "Import failed");
      setResult(data);
      setStep("done");
      if (data.imported > 0) {
        onSuccess();
        toast({ title: `${data.imported} record(s) imported`, description: data.message });
      } else {
        toast({ variant: "destructive", title: "Nothing imported", description: data.errors[0] ?? data.message });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: e?.message ?? "Unknown error" });
    } finally {
      setBusy(false);
    }
  };

  const toggleFile = (name: string) => setExpandedFiles((prev) => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Import {label}
            {step !== "pick" && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {step === "preview" ? "Step 2 — Preview & confirm" : "Step 3 — Result"}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "pick" && `Upload CSV or Excel (.xlsx) files. Each file is parsed and validated before any data is saved.`}
            {step === "preview" && `Review how each row will map to the database. Rows with errors are skipped automatically — fix and re-upload to include them.`}
            {step === "done" && `Import complete.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: pick files ──────────────────────────────────────────── */}
        {step === "pick" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Files are validated row-by-row. You'll see a preview of every mapped value before anything is saved.</span>
            </div>

            <div
              role="button" tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none",
                dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/60 hover:bg-muted/20",
              )}
            >
              <Upload className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1.5">CSV · Excel (.xlsx)</p>
              <p className="text-xs text-muted-foreground">Max 5 MB per file · up to 10 files</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={onInputChange} />
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-muted/20">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{f.name}</span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0", getExtBadgeColor(f.name))}>
                      {f.name.toLowerCase().match(/\.[^.]+$/)?.[0]?.slice(1).toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatFileSize(f.size)}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border overflow-hidden">
              <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/30 transition-colors" onClick={() => setShowGuide((v) => !v)}>
                <span>Column format guide</span>
                <span className="text-muted-foreground text-xs">{showGuide ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showGuide && (
                <div className="border-t px-4 pb-4 pt-3 space-y-1.5">
                  {COLUMN_GUIDE[type].map((g) => (
                    <div key={g.col} className="flex items-start gap-2 text-xs">
                      <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] flex-shrink-0">{g.col}</code>
                      {g.required && <span className="text-[10px] font-semibold text-red-600 mt-0.5 flex-shrink-0">REQ</span>}
                      <span className="text-muted-foreground leading-relaxed">{g.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs" onClick={() => downloadTemplate(type)}>
                <Download className="h-3.5 w-3.5" /> Download Template
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-full" onClick={handleClose} disabled={busy}>Cancel</Button>
                <Button className="rounded-full gap-2" disabled={!files.length || busy} onClick={runPreview}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {busy ? "Validating…" : `Preview ${files.length || ""} file${files.length !== 1 ? "s" : ""}`.trim()}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: preview ─────────────────────────────────────────────── */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <SummaryStat label="Rows" value={preview.totals.rows} tone="neutral" />
              <SummaryStat label="Valid" value={preview.totals.valid} tone="success" />
              <SummaryStat label="Errors" value={preview.totals.errors} tone={preview.totals.errors ? "error" : "neutral"} />
              <SummaryStat label="Warnings" value={preview.totals.warnings} tone={preview.totals.warnings ? "warning" : "neutral"} />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{preview.message}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} className="h-3 w-3 accent-primary" />
                Show only rows with errors
              </label>
            </div>

            <div className="space-y-2">
              {preview.files.map((f) => {
                const visibleRows = errorsOnly ? f.rows.filter((r) => r.errors.length) : f.rows;
                const open = expandedFiles.has(f.file);
                return (
                  <div key={f.file} className="rounded-xl border overflow-hidden">
                    <button type="button" onClick={() => toggleFile(f.file)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
                      {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">{f.file}</span>
                      <span className="text-[11px] text-muted-foreground">{f.rowCount} rows</span>
                      {f.validCount > 0 && <span className="text-[11px] flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" />{f.validCount}</span>}
                      {f.errorCount > 0 && <span className="text-[11px] flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" />{f.errorCount}</span>}
                      {f.warningCount > 0 && <span className="text-[11px] flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />{f.warningCount}</span>}
                    </button>

                    {open && (
                      <div className="border-t bg-muted/10">
                        {f.unmappedHeaders.length > 0 && (
                          <div className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/40">
                            <strong>Unrecognised columns:</strong> {f.unmappedHeaders.join(", ")} — these will be ignored.
                          </div>
                        )}
                        {f.fileWarnings.map((w, i) => (
                          <div key={i} className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 border-b border-amber-200/40">{w}</div>
                        ))}
                        {visibleRows.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No rows to show.</div>
                        ) : (
                          <div className="max-h-[300px] overflow-y-auto divide-y">
                            {visibleRows.slice(0, 100).map((r) => (
                              <RowCard key={`${r.file}-${r.rowNum}`} row={r} />
                            ))}
                            {visibleRows.length > 100 && (
                              <div className="px-3 py-2 text-[11px] text-center text-muted-foreground italic">
                                …and {visibleRows.length - 100} more row(s). Commit to import all valid rows.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setStep("pick")} disabled={busy}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-full" onClick={handleClose} disabled={busy}>Cancel</Button>
                <Button className="rounded-full gap-2" disabled={busy || preview.totals.valid === 0} onClick={commit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busy ? "Importing…" : `Commit ${preview.totals.valid} valid row${preview.totals.valid !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: result ──────────────────────────────────────────────── */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-semibold">{result.imported} imported</span>
                </div>
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-semibold">{result.skipped} skipped</span>
                  </div>
                )}
                {result.blocked.length > 0 && (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-sm font-semibold">{result.blocked.length} file(s) blocked</span>
                  </div>
                )}
              </div>
              {(result.errors.length > 0 || result.blocked.length > 0) && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {[...result.blocked.map((m) => ({ kind: "blocked" as const, text: m })),
                    ...result.errors.map((m) => ({ kind: "error" as const, text: m }))].map((m, i) => (
                    <div key={i} className={cn(
                      "text-xs rounded px-2.5 py-1.5 font-mono leading-relaxed",
                      m.kind === "blocked"
                        ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
                    )}>{m.text}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => reset()}>Import more</Button>
              <Button size="sm" className="rounded-full" onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "error" | "warning" }) {
  const toneClass =
    tone === "success" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
    : tone === "error" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-300"
    : tone === "warning" ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
    : "border-border bg-muted/20 text-foreground";
  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClass)}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

function RowCard({ row }: { row: PreviewRow }) {
  const isError = row.errors.length > 0;
  const isWarn = !isError && row.warnings.length > 0;
  const mappedEntries = row.mapped ? Object.entries(row.mapped).filter(([, v]) => v !== null && v !== "" && v !== undefined) : [];

  return (
    <div className={cn("px-3 py-2.5 text-xs",
      isError ? "bg-red-50/40 dark:bg-red-950/10" : isWarn ? "bg-amber-50/40 dark:bg-amber-950/10" : "",
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">row {row.rowNum}</span>
        {isError ? (
          <span className="flex items-center gap-1 text-red-600 font-medium"><XCircle className="h-3 w-3" /> skipped</span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="h-3 w-3" /> will import</span>
        )}
        {isWarn && <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" /> warning</span>}
      </div>

      {mappedEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mb-1">
          {mappedEntries.map(([k, v]) => (
            <span key={k}><span className="font-mono opacity-70">{k}:</span> <span className="text-foreground">{String(v)}</span></span>
          ))}
        </div>
      )}

      {row.errors.map((e, i) => (
        <div key={`e-${i}`} className="text-red-700 dark:text-red-400 leading-relaxed">• {e}</div>
      ))}
      {row.warnings.map((w, i) => (
        <div key={`w-${i}`} className="text-amber-700 dark:text-amber-400 leading-relaxed">• {w}</div>
      ))}
    </div>
  );
}
