import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  TrendingUp,
  History,
  Clock,
  User,
  ChevronRight,
  RefreshCw,
  PencilLine,
  GitMerge,
  PlusCircle,
  EyeOff,
  Search,
  CalendarRange,
  FileDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { customFetch, ApiError } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLLBACK_WINDOW_HOURS = 24;

const SUPPRESSED_WARNINGS_KEY = "import_portal_suppressed_warnings";

type ImportMode = "insert" | "update" | "upsert";

// Normalize a warning message into a stable key by stripping variable content
// (quoted field values, numbers) so the same warning type can be matched across rows.
function getWarningKey(w: string): string {
  return w
    .replace(/"[^"]*"/g, '"{value}"') // strip quoted field values
    .replace(/\b\d+\b/g, "{n}"); // strip bare numbers (e.g. reorder defaults)
}

// Scope the localStorage key by userId so preferences don't bleed between users
// who share the same browser profile.
function getScopedKey(userId?: number): string {
  return userId ? `${SUPPRESSED_WARNINGS_KEY}:${userId}` : SUPPRESSED_WARNINGS_KEY;
}

function loadSuppressedWarnings(userId?: number): Set<string> {
  try {
    const raw = localStorage.getItem(getScopedKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveSuppressedWarnings(s: Set<string>, userId?: number): void {
  try {
    localStorage.setItem(getScopedKey(userId), JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ImportBatch {
  id: number;
  batchId: string;
  importedByName: string;
  fileName: string;
  rowCount: number;
  insertedCount?: number;
  updatedCount?: number;
  errorCount?: number;
  status: "committed" | "rolled_back" | "partially_rolled_back" | "rolling_back" | "rollback_failed";
  productIds: number[];
  createdAt: string;
  updatedAt: string;
  canRollback: boolean;
  rollbackWindowHours: number;
}

interface RollbackResponse {
  status: "rolled_back" | "partially_rolled_back" | "rollback_failed";
  restored: number;
  archived: number;
  manualReview: number;
  failed: number;
  categoriesArchived?: { id: string; name: string | null }[];
  report?: { id: string; action: string; rowNum: number; outcome: string; detail?: string }[];
}

/** Turns a rollback response into the right toast — the three possible
 *  outcomes (fully rolled back, partially rolled back, failed) must never be
 *  collapsed into one generic "Rolled back" message, since a partial or
 *  failed rollback still needs the user's attention. */
function describeRollback(body: RollbackResponse): {
  title: string;
  description: string;
  variant?: "destructive";
} {
  const parts: string[] = [];
  if (body.restored) parts.push(`${body.restored} restored`);
  if (body.archived) parts.push(`${body.archived} archived`);
  if (body.manualReview) parts.push(`${body.manualReview} need manual review`);
  if (body.failed) parts.push(`${body.failed} failed`);
  const summary = parts.join(", ") || "no rows to process";

  if (body.status === "rolled_back") {
    return { title: "Rolled back", description: `Rollback complete — ${summary}.` };
  }
  if (body.status === "partially_rolled_back") {
    return {
      title: "Rollback partially completed",
      description: `Some rows could not be fully undone — ${summary}. Check Import History for details.`,
      variant: "destructive",
    };
  }
  return {
    title: "Rollback failed",
    description: `Nothing could be undone — ${summary}. No changes were made beyond what's reported.`,
    variant: "destructive",
  };
}

/** Turns a caught rollback request error into a toast. A 409 means the
 *  batch's rollback state changed elsewhere (already rolling back, or
 *  already fully rolled back by another request) rather than this request
 *  failing outright, so it gets its own message and the caller should
 *  refresh instead of just reporting failure. */
function describeRollbackError(err: unknown): {
  title: string;
  description: string;
  variant?: "destructive";
} {
  if (err instanceof ApiError && err.status === 409) {
    return {
      title: "Rollback already in progress or complete",
      description: (err.data as { message?: string } | null)?.message ?? err.message,
    };
  }
  return {
    variant: "destructive",
    title: "Rollback failed",
    description: err instanceof Error ? err.message : String(err),
  };
}

/** Icon/badge styling + label per batch status - kept as one lookup so the
 *  history row icon, the status badge, and the detail-panel banner can't
 *  drift out of sync on which of the 5 statuses gets which color/label. */
const BATCH_STATUS_META: Record<
  ImportBatch["status"],
  { label: string; tone: "emerald" | "rose" | "amber" | "blue" }
> = {
  committed: { label: "Committed", tone: "emerald" },
  rolled_back: { label: "Rolled Back", tone: "rose" },
  partially_rolled_back: { label: "Partially Rolled Back", tone: "amber" },
  rolling_back: { label: "Rolling Back…", tone: "blue" },
  rollback_failed: { label: "Rollback Failed", tone: "rose" },
};

const TONE_CLASSES = {
  emerald: {
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badge:
      "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-900/20",
  },
  rose: {
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    iconColor: "text-rose-500 dark:text-rose-400",
    badge:
      "border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:bg-rose-900/20",
  },
  amber: {
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    badge:
      "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-900/20",
  },
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    badge:
      "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-900/20",
  },
} as const;

interface BatchDetail extends ImportBatch {
  overwriteFields?: string[] | null;
  liveProducts: {
    id: number;
    name: string;
    sku: string | null;
    price: string;
    category: string | null;
  }[];
  previewRows: {
    name: string;
    sku: string | null;
    price: string;
    category: string | null;
    action?: string;
  }[];
  importMode?: ImportMode;
}

function SummaryStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <p className={`text-lg font-semibold ${warn ? "text-amber-600" : ""}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Import History Tab ─────────────────────────────────────────────────────────

function ImportHistoryTab() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackConfirmBatchId, setRollbackConfirmBatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await customFetch<{ batches: ImportBatch[] }>("/api/products/import/history");
      setBatches(data.batches);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load history",
        description: err instanceof Error ? err.message : String(err),
      });
      setBatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredBatches = useMemo(() => {
    if (!batches) return null;
    let result = batches;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (b) => b.fileName.toLowerCase().includes(q) || b.importedByName.toLowerCase().includes(q),
      );
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((b) => new Date(b.createdAt).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((b) => new Date(b.createdAt).getTime() <= to.getTime());
    }
    return result;
  }, [batches, searchQuery, dateFrom, dateTo]);

  const hasActiveFilters = searchQuery.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const qs = params.toString();
      const blob = await customFetch<Blob>(
        `/api/products/import/history/export${qs ? `?${qs}` : ""}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `import-history-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const toggleBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchDetail(null);
      return;
    }
    setExpandedBatchId(batchId);
    setBatchDetail(null);
    setIsLoadingDetail(true);
    const requestedBatchId = batchId;
    try {
      const data = await customFetch<BatchDetail>(`/api/products/import/${batchId}`);
      setExpandedBatchId((current) => {
        if (current === requestedBatchId) {
          setBatchDetail(data);
        }
        return current;
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load batch detail",
        description: err instanceof Error ? err.message : String(err),
      });
      setExpandedBatchId((current) => (current === requestedBatchId ? null : current));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const performRollback = async () => {
    if (!rollbackConfirmBatchId) return;
    setIsRollingBack(true);
    try {
      const body = await customFetch<RollbackResponse>(
        `/api/products/import/${rollbackConfirmBatchId}/rollback`,
        { method: "DELETE" },
      );
      toast(describeRollback(body));
      setRollbackConfirmBatchId(null);
      setExpandedBatchId(null);
      setBatchDetail(null);
      await loadHistory();
    } catch (err) {
      toast(describeRollbackError(err));
      if (err instanceof ApiError && err.status === 409) {
        setRollbackConfirmBatchId(null);
        await loadHistory();
      }
    } finally {
      setIsRollingBack(false);
    }
  };

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading import history…</span>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <History className="h-7 w-7" />
        </div>
        <p className="font-medium">No import history yet</p>
        <p className="text-sm">Completed imports will appear here.</p>
      </div>
    );
  }

  const displayBatches = filteredBatches ?? [];

  return (
    <div className="space-y-4">
      {/* ── Filter bar ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by file name or staff member…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-sm w-[130px]"
            title="From date"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-sm w-[130px]"
            title="To date"
          />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Clear filters"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
              <Search className="h-3 w-3 shrink-0" />
              &ldquo;{searchQuery.trim()}&rdquo;
              <button
                onClick={() => setSearchQuery("")}
                className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                title="Remove search filter"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {dateFrom && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
              <CalendarRange className="h-3 w-3 shrink-0" />
              From{" "}
              {new Date(dateFrom).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              <button
                onClick={() => setDateFrom("")}
                className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                title="Remove from-date filter"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {dateTo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
              <CalendarRange className="h-3 w-3 shrink-0" />
              To{" "}
              {new Date(dateTo).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              <button
                onClick={() => setDateTo("")}
                className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                title="Remove to-date filter"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {hasActiveFilters
            ? `${displayBatches.length} of ${batches.length} import${batches.length !== 1 ? "s" : ""}`
            : `${batches.length} import${batches.length !== 1 ? "s" : ""} on record`}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCsv}
            disabled={isExporting || displayBatches.length === 0}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              hasActiveFilters ? "Export filtered results to CSV" : "Export all imports to CSV"
            }
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Export CSV
          </button>
          <button
            onClick={loadHistory}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {displayBatches.length === 0 && hasActiveFilters ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground rounded-lg border">
          <Search className="h-8 w-8" />
          <p className="font-medium">No matches found</p>
          <p className="text-sm">Try adjusting your search or date range.</p>
          <div className="flex flex-wrap justify-center gap-1.5 mt-1">
            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
                <Search className="h-3 w-3 shrink-0" />
                &ldquo;{searchQuery.trim()}&rdquo;
                <button
                  onClick={() => setSearchQuery("")}
                  className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                  title="Remove search filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {dateFrom && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
                <CalendarRange className="h-3 w-3 shrink-0" />
                From{" "}
                {new Date(dateFrom).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                <button
                  onClick={() => setDateFrom("")}
                  className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                  title="Remove from-date filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {dateTo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium">
                <CalendarRange className="h-3 w-3 shrink-0" />
                To{" "}
                {new Date(dateTo).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                <button
                  onClick={() => setDateTo("")}
                  className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors p-0.5"
                  title="Remove to-date filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
          <button
            onClick={clearFilters}
            className="text-xs underline underline-offset-2 hover:text-foreground"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {displayBatches.map((batch, idx) => {
            const isExpanded = expandedBatchId === batch.batchId;
            const canRollback = batch.canRollback;
            const statusMeta = BATCH_STATUS_META[batch.status];
            const toneClasses = TONE_CLASSES[statusMeta.tone];

            return (
              <div key={batch.batchId} className={idx > 0 ? "border-t" : ""}>
                <button
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-center gap-3"
                  onClick={() => toggleBatch(batch.batchId)}
                >
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${toneClasses.iconBg}`}
                  >
                    <FileSpreadsheet className={`h-4 w-4 ${toneClasses.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate max-w-[200px]">
                        {batch.fileName}
                      </span>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${toneClasses.badge}`}>
                        {statusMeta.label}
                      </Badge>
                      {canRollback && (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0 border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-900/20"
                        >
                          Undoable
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {batch.importedByName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeDate(batch.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {batch.rowCount} product{batch.rowCount !== 1 ? "s" : ""}
                      </span>
                      {(!!batch.insertedCount || !!batch.updatedCount || !!batch.errorCount) && (
                        <span className="flex items-center gap-1">
                          <PlusCircle className="h-3 w-3" />
                          {batch.insertedCount ?? 0} added, {batch.updatedCount ?? 0} updated
                          {!!batch.errorCount && (
                            <span className="text-rose-600 dark:text-rose-400 font-medium">
                              , {batch.errorCount} failed
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/20 px-4 py-4 space-y-4">
                    {isLoadingDetail && !batchDetail ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading products…
                      </div>
                    ) : batchDetail ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="rounded-lg border bg-background p-2.5">
                            <p className="text-muted-foreground">Batch ID</p>
                            <p className="font-mono font-medium mt-0.5">
                              {batchDetail.batchId.split("-")[0]}…
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background p-2.5">
                            <p className="text-muted-foreground">Imported</p>
                            <p className="font-medium mt-0.5">
                              {new Date(batchDetail.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background p-2.5">
                            <p className="text-muted-foreground">Mode</p>
                            <p className="font-medium mt-0.5 capitalize">
                              {batchDetail.importMode ?? "insert"}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background p-2.5">
                            <p className="text-muted-foreground">Changes</p>
                            <p className="font-medium mt-0.5">
                              {batchDetail.insertedCount != null ||
                              batchDetail.updatedCount != null ? (
                                <>
                                  {batchDetail.insertedCount ?? 0} added
                                  {(batchDetail.updatedCount ?? 0) > 0 &&
                                    `, ${batchDetail.updatedCount} updated`}
                                </>
                              ) : (
                                `${batchDetail.rowCount} rows`
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Overwrite field summary — only shown for update/upsert batches */}
                        {batchDetail.importMode && batchDetail.importMode !== "insert" && (
                          <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
                            <p className="text-muted-foreground mb-1.5">Fields overwritten</p>
                            {batchDetail.overwriteFields == null ? (
                              <p className="text-foreground font-medium">All fields</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {batchDetail.overwriteFields.map((key) => {
                                  const label =
                                    OVERWRITE_FIELD_DEFS.find((f) => f.key === key)?.label ?? key;
                                  return (
                                    <span
                                      key={key}
                                      className="inline-flex items-center rounded-md bg-background border px-1.5 py-0.5 text-[11px]"
                                    >
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {(() => {
                          // Matches products.import.$batchId.ts's own
                          // hasLiveProducts rule: a partial rollback failure
                          // can leave some of this batch's products still
                          // live, not just a fully "committed" batch.
                          const hasLiveProducts =
                            batchDetail.status === "committed" ||
                            batchDetail.status === "partially_rolled_back" ||
                            batchDetail.status === "rollback_failed";
                          const rows =
                            hasLiveProducts && batchDetail.liveProducts.length > 0
                              ? batchDetail.liveProducts.map((p) => ({
                                  name: p.name,
                                  sku: p.sku,
                                  price: p.price,
                                  category: p.category,
                                  action: undefined,
                                }))
                              : batchDetail.previewRows;
                          const isTruncated = batchDetail.rowCount > rows.length;

                          return rows.length > 0 ? (
                            <div className="rounded-lg border overflow-hidden bg-background">
                              <div className="px-3 py-2 bg-muted/50 border-b">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {hasLiveProducts
                                    ? "Imported products"
                                    : "Products that were imported"}{" "}
                                  — showing {rows.length}
                                  {isTruncated ? ` of ${batchDetail.rowCount}` : ""}
                                </p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="px-3 py-2 text-left font-medium">
                                        Product Name
                                      </th>
                                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                                      <th className="px-3 py-2 text-left font-medium">Category</th>
                                      <th className="px-3 py-2 text-left font-medium">Action</th>
                                      <th className="px-3 py-2 text-right font-medium">Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((p, i) => (
                                      <tr
                                        key={i}
                                        className="border-b last:border-0 hover:bg-muted/20"
                                      >
                                        <td className="px-3 py-2 font-medium max-w-[200px] truncate">
                                          {p.name || "—"}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground font-mono">
                                          {p.sku || "—"}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {p.category || "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                          {p.action === "updated" ? (
                                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                              <PencilLine className="h-3 w-3" />
                                              updated
                                            </span>
                                          ) : p.action === "inserted" ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                              <PlusCircle className="h-3 w-3" />
                                              inserted
                                            </span>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right">₵{p.price || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {isTruncated && (
                                <div className="px-3 py-2 border-t text-center text-xs text-muted-foreground">
                                  …and {batchDetail.rowCount - rows.length} more product
                                  {batchDetail.rowCount - rows.length !== 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No product detail available for this batch.
                            </p>
                          );
                        })()}

                        {batchDetail.canRollback && (
                          <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                Rollback available
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                {batchDetail.status === "committed"
                                  ? `This import can be undone within ${batchDetail.rollbackWindowHours} hours. `
                                  : "This import's previous rollback attempt didn't fully complete — you can retry it now. "}
                                Inserted products with no other activity will be archived; updated
                                products will be restored to their previous values.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                              onClick={() => setRollbackConfirmBatchId(batchDetail.batchId)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Undo Import
                            </Button>
                          </div>
                        )}

                        {(batch.status === "rolled_back" ||
                          batch.status === "partially_rolled_back" ||
                          batch.status === "rollback_failed") && (
                          <div
                            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                              batch.status === "rolled_back"
                                ? "border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/10 text-rose-700 dark:text-rose-400"
                                : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            <RotateCcw className="h-4 w-4 shrink-0" />
                            <span>
                              {batch.status === "rolled_back" &&
                                `This import was rolled back on ${new Date(
                                  batchDetail.updatedAt,
                                ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`}
                              {batch.status === "partially_rolled_back" &&
                                `This import's rollback only partially completed on ${new Date(
                                  batchDetail.updatedAt,
                                ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — some rows still need manual review. Undo Import again to retry the rest.`}
                              {batch.status === "rollback_failed" &&
                                `This import's rollback failed on ${new Date(
                                  batchDetail.updatedAt,
                                ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — nothing was undone. Undo Import again to retry.`}
                            </span>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!rollbackConfirmBatchId}
        onOpenChange={(open) => {
          if (!open) setRollbackConfirmBatchId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Inserted products will be permanently deleted. Updated products will be restored to
              their previous values. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performRollback}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rolling back…
                </>
              ) : (
                "Yes, undo import"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface RowData {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  price: string | null;
  cost: string | null;
  sellingPrice: string | null;
  wholesalePrice: string | null;
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

interface PrevValues {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  price: string | null;
  cost: string | null;
  sellingPrice: string | null;
  wholesalePrice: string | null;
  stock: number;
  unit: string | null;
  description: string | null;
  reorderPoint: number;
  imageUrl: string | null;
  expiryDate: string | null;
  batchLotNumber: string | null;
}

interface PreviewRow {
  rowNum: number;
  status: "ok" | "warning" | "error";
  errors: string[];
  warnings: string[];
  matchedExistingId: number | null;
  matchedBy?: "sku" | "barcode" | "name" | null;
  /** current stock + this row's imported stock, once committed */
  finalStock?: number | null;
  /** Current DB values for the matched product — used for before/after diff display. */
  prevValues: PrevValues | null;
  data: RowData;
}

interface CategoryMappingEntry {
  csvCategory: string;
  existingCategoryId: string | null;
  existingCategoryName: string | null;
  willCreate: boolean;
  productCount: number;
}

interface PreviewResult {
  batchId: string;
  fileName: string;
  templateVersion: number | null;
  templateVersionWarning: string | null;
  fileWarnings: string[];
  importMode: ImportMode;
  rows: PreviewRow[];
  summary: {
    total: number;
    ok: number;
    warnings: number;
    errors: number;
    updates?: number;
    newProducts?: number;
    updatedProducts?: number;
    categoriesMatched?: number;
    categoriesToCreate?: number;
    duplicateProductRows?: number;
    invalidRows?: number;
    productsWithExpiry?: number;
    productsWithoutExpiry?: number;
    expiredProducts?: number;
    expiringSoon?: number;
    totalImportedStock?: number;
    purchaseValue?: number;
    sellingValue?: number;
  };
  categoryMapping?: CategoryMappingEntry[];
  possibleDuplicateOf?: { batchId: string; filename: string; committedAt: string } | null;
}

// ── Client-side row re-validator ───────────────────────────────────────────────
// Only re-validates the EDITED fields. Errors/warnings for untouched fields
// (including contextual checks like duplicate SKU that need DB state) are
// preserved from the original row so they aren't silently cleared.

const FIELD_ERROR_PATTERNS: Record<string, RegExp> = {
  name: /Product Name/i,
  price: /Selling Price/i,
  cost: /Purchase Price/i,
  sellingPrice: /Selling Price/i,
  wholesalePrice: /Wholesale Price/i,
  stock: /Stock Quantity|Quantity/i,
  reorderPoint: /Reorder Point|Reorder Level/i,
  category: /Category/i,
  sku: /\bSKU\b/i,
  barcode: /\bBarcode\b/i,
  expiryDate: /Expiry Date/i,
  batchLotNumber: /Batch/i,
};

// editedRows stores raw strings for all fields — numeric fields are validated as
// strings (same rules as the server) and only parsed to numbers for display.
type EditedRawValues = Record<string, string>;

function revalidateEditedRow(
  originalRow: PreviewRow,
  editedRaw: EditedRawValues,
  editedFields: Set<string>,
): PreviewRow {
  // Preserve errors/warnings for fields that were NOT edited (contextual checks
  // like duplicate-SKU detection that need DB state can't be re-run client-side).
  const preservedErrors = originalRow.errors.filter(
    (err) => !Array.from(editedFields).some((f) => FIELD_ERROR_PATTERNS[f]?.test(err)),
  );
  const preservedWarnings = originalRow.warnings.filter(
    (w) => !Array.from(editedFields).some((f) => FIELD_ERROR_PATTERNS[f]?.test(w)),
  );

  const newErrors: string[] = [...preservedErrors];
  const newWarnings: string[] = [...preservedWarnings];

  if (editedFields.has("name")) {
    if (!(editedRaw.name ?? "").trim()) newErrors.push("Product Name is required");
  }

  if (editedFields.has("price") && editedRaw.price) {
    const p = editedRaw.price;
    if (p.includes(","))
      newErrors.push(
        `Selling Price "${p}" must not contain commas — use a plain decimal (e.g. 1500.00)`,
      );
    else if (!/^\d+(\.\d+)?$/.test(p)) newErrors.push(`Selling Price "${p}" is not a valid number`);
    else if (/\.\d{3,}/.test(p))
      newErrors.push(`Selling Price "${p}" has more than 2 decimal places`);
    else if (parseFloat(p) < 0) newErrors.push("Selling Price cannot be negative");
  }

  if (editedFields.has("cost") && editedRaw.cost) {
    const c = editedRaw.cost;
    if (c.includes(",")) newErrors.push(`Purchase Price "${c}" must not contain commas`);
    else if (!/^\d+(\.\d+)?$/.test(c))
      newErrors.push(`Purchase Price "${c}" is not a valid number`);
    else if (/\.\d{3,}/.test(c))
      newErrors.push(`Purchase Price "${c}" has more than 2 decimal places`);
    else if (parseFloat(c) < 0) newErrors.push("Purchase Price cannot be negative");
  }

  if (editedFields.has("sellingPrice") && editedRaw.sellingPrice) {
    const sp = editedRaw.sellingPrice;
    if (sp.includes(",")) newErrors.push(`Selling Price "${sp}" must not contain commas`);
    else if (!/^\d+(\.\d+)?$/.test(sp))
      newErrors.push(`Selling Price "${sp}" is not a valid number`);
    else if (/\.\d{3,}/.test(sp))
      newErrors.push(`Selling Price "${sp}" has more than 2 decimal places`);
  }

  if (editedFields.has("wholesalePrice") && editedRaw.wholesalePrice) {
    const wp = editedRaw.wholesalePrice;
    if (wp.includes(",")) newErrors.push(`Wholesale Price "${wp}" must not contain commas`);
    else if (!/^\d+(\.\d+)?$/.test(wp))
      newErrors.push(`Wholesale Price "${wp}" is not a valid number`);
    else if (/\.\d{3,}/.test(wp))
      newErrors.push(`Wholesale Price "${wp}" has more than 2 decimal places`);
  }

  if (editedFields.has("expiryDate") && editedRaw.expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editedRaw.expiryDate)) {
      newWarnings.push(
        `Expiry Date "${editedRaw.expiryDate}" is not in YYYY-MM-DD format — server will try to normalise.`,
      );
    }
  }

  if (editedFields.has("stock")) {
    const s = editedRaw.stock ?? "";
    if (s.includes(","))
      newErrors.push(`Quantity "${s}" must not contain commas — use a plain whole number`);
    else if (!/^\d+$/.test(s)) newErrors.push(`Quantity "${s}" must be a whole number`);
    else if (parseInt(s, 10) < 0) newErrors.push("Quantity cannot be negative");
  }

  if (editedFields.has("reorderPoint")) {
    const rl = editedRaw.reorderPoint ?? "";
    if (rl && !/^\d+$/.test(rl))
      newWarnings.push(`Reorder Level "${rl}" is not a valid integer; defaulting to 10`);
  }

  if (editedFields.has("category") && !editedRaw.category)
    newWarnings.push("Category not specified");
  if (editedFields.has("sku") && !editedRaw.sku)
    newWarnings.push("SKU not provided — a SKU helps with future updates");

  // Build mergedData for display (parse numeric fields only after validation)
  const mergedData: RowData = {
    ...originalRow.data,
    ...(editedFields.has("name") ? { name: editedRaw.name ?? "" } : {}),
    ...(editedFields.has("sku") ? { sku: editedRaw.sku || null } : {}),
    ...(editedFields.has("barcode") ? { barcode: editedRaw.barcode || null } : {}),
    ...(editedFields.has("category") ? { category: editedRaw.category || null } : {}),
    ...(editedFields.has("brand") ? { brand: editedRaw.brand || null } : {}),
    ...(editedFields.has("price") ? { price: editedRaw.price || null } : {}),
    ...(editedFields.has("cost") ? { cost: editedRaw.cost || null } : {}),
    ...(editedFields.has("sellingPrice") ? { sellingPrice: editedRaw.sellingPrice || null } : {}),
    ...(editedFields.has("wholesalePrice")
      ? { wholesalePrice: editedRaw.wholesalePrice || null }
      : {}),
    ...(editedFields.has("stock") ? { stock: parseInt(editedRaw.stock ?? "", 10) || 0 } : {}),
    ...(editedFields.has("unit") ? { unit: editedRaw.unit || null } : {}),
    ...(editedFields.has("description") ? { description: editedRaw.description || null } : {}),
    ...(editedFields.has("reorderPoint")
      ? { reorderPoint: parseInt(editedRaw.reorderPoint ?? "", 10) || 10 }
      : {}),
    ...(editedFields.has("imageUrl") ? { imageUrl: editedRaw.imageUrl || null } : {}),
    ...(editedFields.has("supplier") ? { supplier: editedRaw.supplier || null } : {}),
    ...(editedFields.has("taxInfo") ? { taxInfo: editedRaw.taxInfo || null } : {}),
    ...(editedFields.has("expiryDate") ? { expiryDate: editedRaw.expiryDate || null } : {}),
    ...(editedFields.has("batchLotNumber")
      ? { batchLotNumber: editedRaw.batchLotNumber || null }
      : {}),
  };

  const status: PreviewRow["status"] =
    newErrors.length > 0 ? "error" : newWarnings.length > 0 ? "warning" : "ok";
  return { ...originalRow, status, errors: newErrors, warnings: newWarnings, data: mergedData };
}

// ── Row status helpers ─────────────────────────────────────────────────────────

function RowStatusIcon({ status, isMatch }: { status: PreviewRow["status"]; isMatch: boolean }) {
  if (isMatch) return <PencilLine className="h-4 w-4 text-blue-500 shrink-0" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  return <XCircle className="h-4 w-4 text-rose-500 shrink-0" />;
}

function rowBg(status: PreviewRow["status"], isMatch: boolean) {
  if (isMatch) return "bg-blue-50/60 dark:bg-blue-900/10";
  if (status === "ok") return "bg-emerald-50/60 dark:bg-emerald-900/10";
  if (status === "warning") return "bg-amber-50/60 dark:bg-amber-900/10";
  return "bg-rose-50/60 dark:bg-rose-900/10";
}

// ── Mode Toggle ────────────────────────────────────────────────────────────────

// ── Overwrite Field Definitions ─────────────────────────────────────────────

/** Fields that can be selectively overwritten in update/upsert mode. */
const OVERWRITE_FIELD_DEFS: { key: string; label: string; group: string }[] = [
  { key: "name", label: "Product Name", group: "identity" },
  { key: "price", label: "Selling Price", group: "pricing" },
  { key: "cost", label: "Purchase Price", group: "pricing" },
  { key: "sellingPrice", label: "Legacy Selling", group: "pricing" },
  { key: "wholesalePrice", label: "Wholesale Price", group: "pricing" },
  { key: "category", label: "Category", group: "details" },
  { key: "brand", label: "Brand", group: "details" },
  { key: "description", label: "Description", group: "details" },
  { key: "unit", label: "Unit of Measure", group: "details" },
  { key: "reorderPoint", label: "Reorder Point", group: "inventory" },
  { key: "expiryDate", label: "Expiry Date", group: "inventory" },
  { key: "batchLotNumber", label: "Batch / Lot Number", group: "inventory" },
  { key: "imageUrl", label: "Image URL", group: "details" },
];

const ALL_OVERWRITE_KEYS = new Set(OVERWRITE_FIELD_DEFS.map((f) => f.key));

const MODE_OPTIONS: {
  value: ImportMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "insert",
    label: "Insert new",
    description:
      "Only add products not already in the catalogue. Duplicates are flagged as errors.",
    icon: <PlusCircle className="h-3.5 w-3.5" />,
  },
  {
    value: "update",
    label: "Update existing",
    description:
      "Only update products that already exist (matched by SKU or barcode). Unmatched rows are skipped.",
    icon: <PencilLine className="h-3.5 w-3.5" />,
  },
  {
    value: "upsert",
    label: "Both (upsert)",
    description:
      "Update matched products and insert new ones in a single pass — ideal for catalogue refreshes.",
    icon: <GitMerge className="h-3.5 w-3.5" />,
  },
];

// ── Pricing_2026 Apply Panel ───────────────────────────────────────────────────

function PricingPanel() {
  const { toast } = useToast();
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<{
    updatedCount: number;
    unmatchedCount: number;
    unmatchedRows: string[];
  } | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const applyPricing = async () => {
    setIsApplying(true);
    setResult(null);
    try {
      const data = await customFetch<{
        updatedCount: number;
        unmatchedCount: number;
        unmatchedRows: string[];
        totalRows: number;
      }>("/api/products/apply-pricing-2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setResult(data);
      toast({
        title: `Pricing_2026 applied`,
        description: `${data.updatedCount} products updated`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Apply failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Card className="border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-base">Apply Pricing_2026</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Update product prices from the attached Champion Mart 2026 pricing sheet (459 rows)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result && (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {result.updatedCount} updated
              </span>
              {result.unmatchedCount > 0 && (
                <button
                  onClick={() => setShowUnmatched(!showUnmatched)}
                  className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {result.unmatchedCount} unmatched
                  {showUnmatched ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
            {showUnmatched && result.unmatchedRows.length > 0 && (
              <div className="rounded border bg-background p-2 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                {result.unmatchedRows.map((r, i) => (
                  <div key={i} className="truncate">
                    {r}
                  </div>
                ))}
                {result.unmatchedCount > result.unmatchedRows.length && (
                  <div className="text-muted-foreground italic">
                    …and {result.unmatchedCount - result.unmatchedRows.length} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <Button
          onClick={applyPricing}
          disabled={isApplying}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isApplying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying prices…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" /> Apply Pricing_2026 to Catalogue
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Matches by SKU first, then product name. No products are deleted — only prices are
          updated.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ImportPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload");
  const [importMode, setImportMode] = useState<ImportMode>("upsert");
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [committedBatchId, setCommittedBatchId] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<{
    importedCount: number;
    updatedCount: number;
  } | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());
  const [showAllRows, setShowAllRows] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<"csv" | "xlsx" | null>(null);

  // Initialise immediately from user-scoped localStorage so there's no flash
  const [suppressedWarnings, setSuppressedWarnings] = useState<Set<string>>(() =>
    loadSuppressedWarnings(user?.id),
  );
  // Which fields to overwrite when updating existing products (update/upsert mode only)
  const [overwriteFields, setOverwriteFields] = useState<Set<string>>(new Set(ALL_OVERWRITE_KEYS));
  const [editedRows, setEditedRows] = useState<Map<number, EditedRawValues>>(new Map());
  const [revalidatedRows, setRevalidatedRows] = useState<Map<number, PreviewRow>>(new Map());
  const [editingCell, setEditingCell] = useState<{ rowNum: number; field: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: push the current suppression list to the server (fire-and-forget)
  const syncToServer = useCallback((keys: Set<string>) => {
    customFetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suppressedImportWarnings: [...keys] }),
    }).catch(() => {
      /* server unavailable — localStorage is the fallback */
    });
  }, []);

  // On mount: fetch server preferences and merge with any locally-cached keys.
  // The server is the source of truth across devices; localStorage is the fast cache.
  useEffect(() => {
    if (!user?.id) return;

    // Always load user-scoped local cache first.  The component's initial state
    // may have read the unscoped key if user.id wasn't available during the lazy
    // initialiser, so we apply the scoped values here regardless of server status.
    const localSet = loadSuppressedWarnings(user.id);

    customFetch<Record<string, unknown>>("/api/user/preferences")
      .then((prefs) => {
        // Treat missing or non-array as empty — still merge with local cache so
        // existing suppressions aren't lost on first-ever server save.
        const rawKeys = prefs.suppressedImportWarnings;
        const serverSet = new Set(Array.isArray(rawKeys) ? (rawKeys as string[]) : []);

        // Union: keep anything the server knows about AND anything cached locally
        // (covers offline usage and migration from the pre-server localStorage data)
        const merged = new Set([...serverSet, ...localSet]);

        setSuppressedWarnings(merged);
        saveSuppressedWarnings(merged, user.id);

        // If merged has keys the server didn't know about, push them up now
        const hasNewKeys = [...merged].some((k) => !serverSet.has(k));
        if (hasNewKeys) {
          syncToServer(merged);
        }
      })
      .catch(() => {
        // Server unavailable — apply user-scoped localStorage so the user's
        // preferences are still honoured even without a network connection.
        setSuppressedWarnings(localSet);
        saveSuppressedWarnings(localSet, user.id);
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const suppressWarning = (warning: string) => {
    const key = getWarningKey(warning);
    setSuppressedWarnings((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveSuppressedWarnings(next, user?.id);
      syncToServer(next);
      return next;
    });
  };

  const unsuppressWarning = (key: string) => {
    setSuppressedWarnings((prev) => {
      const next = new Set(prev);
      next.delete(key);
      saveSuppressedWarnings(next, user?.id);
      syncToServer(next);
      return next;
    });
  };

  const clearAllSuppressed = () => {
    const empty = new Set<string>();
    setSuppressedWarnings(empty);
    saveSuppressedWarnings(empty, user?.id);
    syncToServer(empty);
  };

  const isWarningSuppressed = (warning: string) => suppressedWarnings.has(getWarningKey(warning));

  // When preview result arrives, pre-check ok/warning rows (includes matched update rows) and uncheck error rows
  useEffect(() => {
    if (!previewResult) {
      setCheckedRows(new Set());
      return;
    }
    const initial = new Set(
      previewResult.rows.filter((r) => r.status !== "error").map((r) => r.rowNum),
    );
    setCheckedRows(initial);
  }, [previewResult]);

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleFileSelect = (file: File) => {
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!ext || !new Set([".csv", ".xlsx"]).has(ext)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload a CSV or XLSX file.",
      });
      return;
    }
    setSelectedFile(file);
    setPreviewResult(null);
    setCommittedBatchId(null);
    setCommitSummary(null);
    setForceDuplicate(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewResult(null);
    setCommittedBatchId(null);
    setCommitSummary(null);
    setExpandedRows(new Set());
    setCheckedRows(new Set());
    setEditedRows(new Map());
    setRevalidatedRows(new Map());
    setEditingCell(null);
    setForceDuplicate(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runPreview = async () => {
    if (!selectedFile) return;
    setIsPreviewing(true);
    setEditedRows(new Map());
    setRevalidatedRows(new Map());
    setEditingCell(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("importMode", importMode);
      const data = await customFetch<PreviewResult>("/api/products/import/preview", {
        method: "POST",
        body: form,
      });
      setPreviewResult(data);
      setShowAllRows(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  // Re-run preview automatically when mode changes and a file is already previewed
  const handleModeChange = (newMode: ImportMode) => {
    setImportMode(newMode);
    if (selectedFile && previewResult && !committedBatchId) {
      setPreviewResult(null);
    }
  };

  const saveEdit = useCallback(
    (rowNum: number, field: string, rawValue: string) => {
      setEditingCell(null);
      if (!previewResult) return;
      const originalRow = previewResult.rows.find((r) => r.rowNum === rowNum);
      if (!originalRow) return;

      setEditedRows((prev) => {
        const next = new Map(prev);
        const existingEdits = next.get(rowNum) ?? {};
        // Store the raw string as typed — do NOT pre-coerce numeric fields.
        // Validation treats them as strings, mirroring the server's validateRows logic.
        const newEdits: EditedRawValues = { ...existingEdits, [field]: rawValue };
        next.set(rowNum, newEdits);
        const editedFields = new Set(Object.keys(newEdits));
        const revalidated = revalidateEditedRow(originalRow, newEdits, editedFields);
        setRevalidatedRows((rr) => new Map(rr).set(rowNum, revalidated));
        return next;
      });
    },
    [previewResult],
  );

  const commitImport = async () => {
    if (!previewResult) return;
    if (!checkedRows.size) {
      toast({
        variant: "destructive",
        title: "Nothing to import",
        description: "No rows are selected.",
      });
      return;
    }
    setIsCommitting(true);
    setCommitProgress(10);

    const progressInterval = setInterval(() => {
      setCommitProgress((p) => Math.min(p + 15, 85));
    }, 300);

    const overrides = editedRows.size > 0 ? Object.fromEntries(editedRows.entries()) : undefined;

    try {
      // In update/upsert mode, include the field-overwrite mask so the backend
      // only touches the columns the admin selected. In insert mode, omit it
      // entirely so all columns are written (field selection doesn't apply).
      const needsMask = importMode !== "insert";
      if (needsMask && overwriteFields.size === 0) {
        toast({
          variant: "destructive",
          title: "No fields selected",
          description: "Select at least one field to overwrite before importing.",
        });
        setIsCommitting(false);
        clearInterval(progressInterval);
        setCommitProgress(0);
        return;
      }

      const data = await customFetch<{
        batchId: string;
        importedCount: number;
        updatedCount: number;
        totalAffected: number;
        totalStockAdded?: number;
        categoriesCreated?: string[];
      }>("/api/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: previewResult.batchId,
          selectedRowNums: [...checkedRows],
          rowOverrides: overrides,
          forceDuplicate,
          ...(needsMask ? { overwriteFields: [...overwriteFields] } : {}),
        }),
      });

      clearInterval(progressInterval);
      setCommitProgress(100);

      setCommittedBatchId(data.batchId);
      setCommitSummary({ importedCount: data.importedCount, updatedCount: data.updatedCount });

      // Fan-out invalidate so Inventory, POS, Purchases, Dashboard, Analytics,
      // Reports, and Serial Numbers refresh immediately — alongside the
      // realtime postgres_changes broadcast.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k0 = String(q.queryKey?.[0] ?? "");
          return (
            k0.includes("/api/products") ||
            k0.includes("/api/reports") ||
            k0.includes("/api/sales") ||
            k0.includes("/api/purchase") ||
            k0.includes("report-summary") ||
            k0.includes("dead-stock") ||
            k0.includes("top-products")
          );
        },
      });

      const parts = [];
      if (data.importedCount > 0) parts.push(`${data.importedCount} inserted`);
      if (data.updatedCount > 0) parts.push(`${data.updatedCount} updated`);
      toast({
        title: "Import successful",
        description: `${parts.join(", ")} — visible across Inventory, POS, and Reports now. Batch ID: ${data.batchId.split("-")[0]}`,
      });
    } catch (err) {
      clearInterval(progressInterval);
      setCommitProgress(0);
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const rollbackImport = async () => {
    if (!committedBatchId) return;
    setIsRollingBack(true);
    try {
      const body = await customFetch<RollbackResponse>(
        `/api/products/import/${committedBatchId}/rollback`,
        { method: "DELETE" },
      );
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k0 = String(q.queryKey?.[0] ?? "");
          return (
            k0.includes("/api/products") ||
            k0.includes("/api/reports") ||
            k0.includes("/api/sales") ||
            k0.includes("/api/purchase")
          );
        },
      });
      toast(describeRollback(body));
      setCommittedBatchId(null);
      setCommitSummary(null);
      clearFile();
    } catch (err) {
      toast(describeRollbackError(err));
    } finally {
      setIsRollingBack(false);
      setShowRollbackConfirm(false);
    }
  };

  const downloadTemplate = async (format: "csv" | "xlsx") => {
    setIsDownloadingTemplate(format);
    try {
      const blob = await customFetch<Blob>(`/api/products/import-template?format=${format}`, {
        method: "GET",
        responseType: "blob",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product-import-template-v1.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDownloadingTemplate(null);
    }
  };

  const toggleRow = (rowNum: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum);
      else next.add(rowNum);
      return next;
    });
  };

  const toggleCheck = (rowNum: number) => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum);
      else next.add(rowNum);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (!previewResult) return;
    const allRowNums = displayedRows.map((r) => r.rowNum);
    const allChecked = allRowNums.every((n) => checkedRows.has(n));
    if (allChecked) {
      setCheckedRows((prev) => {
        const next = new Set(prev);
        allRowNums.forEach((n) => next.delete(n));
        return next;
      });
    } else {
      setCheckedRows((prev) => {
        const next = new Set(prev);
        allRowNums.forEach((n) => next.add(n));
        return next;
      });
    }
  };

  const effectiveRows = useMemo(
    () => previewResult?.rows.map((row) => revalidatedRows.get(row.rowNum) ?? row) ?? [],
    [previewResult, revalidatedRows],
  );

  const effectiveSummary = useMemo(() => {
    if (!previewResult) return null;
    return {
      total: effectiveRows.length,
      ok: effectiveRows.filter((r) => r.status === "ok").length,
      warnings: effectiveRows.filter((r) => r.status === "warning").length,
      errors: effectiveRows.filter((r) => r.status === "error").length,
      updates: effectiveRows.filter((r) => r.matchedExistingId !== null && r.status !== "error")
        .length,
    };
  }, [effectiveRows, previewResult]);

  const displayedRows = showAllRows ? effectiveRows : effectiveRows.slice(0, 50);

  const checkedCount = checkedRows.size;
  const skippedErrors = effectiveRows.filter(
    (r) => r.status === "error" && !checkedRows.has(r.rowNum),
  ).length;
  const checkedUpdateCount = effectiveRows.filter(
    (r) => checkedRows.has(r.rowNum) && r.matchedExistingId !== null,
  ).length;
  const checkedInsertCount = checkedCount - checkedUpdateCount;

  if (!isAdminOrManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          The Import Portal is only available to administrators and managers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            Bulk Import Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload a CSV or Excel file to import products in bulk. Preview and validate before
            committing.
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {user?.role === "admin" ? "Administrator" : "Manager"}
        </Badge>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b">
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "upload"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("upload")}
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("history")}
        >
          <History className="h-4 w-4" />
          Import History
        </button>
      </div>

      {/* History tab */}
      {activeTab === "history" && <ImportHistoryTab />}

      {/* Upload tab */}
      {activeTab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: upload + templates */}
          <div className="lg:col-span-1 space-y-4">
            {/* Template Download */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Download Template
                </CardTitle>
                <CardDescription className="text-xs">
                  Use the official template to prepare your data. Required columns are marked with
                  *.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 rounded-lg"
                  onClick={() => downloadTemplate("xlsx")}
                  disabled={isDownloadingTemplate === "xlsx"}
                >
                  {isDownloadingTemplate === "xlsx" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 text-emerald-600" />
                  )}
                  <span className="flex-1 text-left">Excel Template (v1)</span>
                  <Badge variant="secondary" className="text-[10px]">
                    XLSX
                  </Badge>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 rounded-lg"
                  onClick={() => downloadTemplate("csv")}
                  disabled={isDownloadingTemplate === "csv"}
                >
                  {isDownloadingTemplate === "csv" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 text-blue-600" />
                  )}
                  <span className="flex-1 text-left">CSV Template (v1)</span>
                  <Badge variant="secondary" className="text-[10px]">
                    CSV
                  </Badge>
                </Button>
                <div className="pt-1 space-y-0.5">
                  {[
                    "Product Name *",
                    "Brand, Unit of Measure",
                    "Purchase Price, Selling Price",
                    "Stock Quantity, Reorder Point",
                    "Expiry Date, Batch / Lot No.",
                    "Category, SKU, Barcode / QR",
                    "Description",
                  ].map((col) => (
                    <div
                      key={col}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <div className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                      {col}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Suppressed Warnings Management */}
            {suppressedWarnings.size > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                      Suppressed warnings
                    </CardTitle>
                    <button
                      onClick={clearAllSuppressed}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <CardDescription className="text-xs">
                    These warning types are dimmed during preview. Click × to restore.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {[...suppressedWarnings].map((key) => (
                    <div
                      key={key}
                      className="flex items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
                    >
                      <p className="flex-1 text-[11px] text-muted-foreground leading-tight line-clamp-2">
                        {key.replace(/"\{value\}"/g, "…").replace(/\{n\}/g, "N")}
                      </p>
                      <button
                        onClick={() => unsuppressWarning(key)}
                        className="shrink-0 h-3.5 w-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Restore this warning type"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: upload zone + preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* Upload Zone */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                {/* Import Mode Toggle */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Import mode
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg border p-1 bg-muted/30">
                    {MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleModeChange(opt.value)}
                        disabled={!!committedBatchId}
                        className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                          importMode === opt.value
                            ? "bg-background shadow-sm text-foreground border"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {MODE_OPTIONS.find((o) => o.value === importMode)?.description}
                  </p>
                </div>

                {/* Field overwrite selector — only relevant in update/upsert mode */}
                {importMode !== "insert" && !committedBatchId && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">
                        Fields to overwrite on existing products
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <button
                          type="button"
                          className="hover:text-foreground transition-colors"
                          onClick={() => setOverwriteFields(new Set(ALL_OVERWRITE_KEYS))}
                        >
                          All
                        </button>
                        <span className="text-muted-foreground/40">·</span>
                        <button
                          type="button"
                          className="hover:text-foreground transition-colors"
                          onClick={() => setOverwriteFields(new Set())}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Only the ticked fields will be overwritten on matched products. Unticked
                      fields are left unchanged.
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-0.5">
                      {OVERWRITE_FIELD_DEFS.map((field) => (
                        <label
                          key={field.key}
                          className="flex items-center gap-2 cursor-pointer group"
                        >
                          <Checkbox
                            checked={overwriteFields.has(field.key)}
                            onCheckedChange={(checked) => {
                              setOverwriteFields((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(field.key);
                                else next.delete(field.key);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs group-hover:text-foreground text-muted-foreground transition-colors">
                            {field.label}
                          </span>
                        </label>
                      ))}
                    </div>
                    {overwriteFields.size === 0 && (
                      <p className="text-[11px] text-destructive pt-0.5">
                        Select at least one field to enable importing.
                      </p>
                    )}
                    {overwriteFields.size > 0 && overwriteFields.size < ALL_OVERWRITE_KEYS.size && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 pt-0.5">
                        {overwriteFields.size} of {ALL_OVERWRITE_KEYS.size} fields will be updated ·{" "}
                        {ALL_OVERWRITE_KEYS.size - overwriteFields.size} will be preserved
                      </p>
                    )}
                  </div>
                )}

                {/* Drag-and-drop zone */}
                <div
                  className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer p-8 text-center
                  ${
                    isDragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : selectedFile
                        ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => !selectedFile && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                        <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                      </div>
                      <p className="font-medium text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB ·{" "}
                        {selectedFile.name.split(".").pop()?.toUpperCase()}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFile();
                        }}
                        className="absolute top-2 right-2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-sm">
                        {isDragging ? "Drop your file here" : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-xs text-muted-foreground">CSV, XLSX · Max 10 MB</p>
                    </div>
                  )}
                </div>

                {/* Preview button */}
                {selectedFile && !committedBatchId && (
                  <Button onClick={runPreview} disabled={isPreviewing} className="w-full">
                    {isPreviewing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validating rows…
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" /> Preview &amp; Validate
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Version warning */}
            {previewResult?.templateVersionWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {previewResult.templateVersionWarning}
              </div>
            )}

            {/* Summary Cards */}
            {previewResult && effectiveSummary && (
              <div
                className={`grid gap-3 ${previewResult.importMode !== "insert" ? "grid-cols-4" : "grid-cols-3"}`}
              >
                <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-900/10 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{effectiveSummary.ok}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ready</p>
                </div>
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-900/10 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{effectiveSummary.warnings}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Warnings</p>
                </div>
                <div className="rounded-lg border bg-rose-50/50 dark:bg-rose-900/10 p-3 text-center">
                  <p className="text-2xl font-bold text-rose-600">{effectiveSummary.errors}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
                </div>
                {previewResult.importMode !== "insert" && (
                  <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{effectiveSummary.updates}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Will Update</p>
                  </div>
                )}
              </div>
            )}

            {/* Rich import summary — computed server-side from the raw upload,
                so it stays stable regardless of in-browser row edits. */}
            {previewResult && previewResult.summary && (
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Import Summary
                </p>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <SummaryStat
                    label="New Products"
                    value={previewResult.summary.newProducts ?? 0}
                  />
                  <SummaryStat
                    label="Existing Products Updated"
                    value={previewResult.summary.updatedProducts ?? 0}
                  />
                  <SummaryStat
                    label="Categories Matched"
                    value={previewResult.summary.categoriesMatched ?? 0}
                  />
                  <SummaryStat
                    label="Categories To Create"
                    value={previewResult.summary.categoriesToCreate ?? 0}
                  />
                  <SummaryStat
                    label="Duplicate Products"
                    value={previewResult.summary.duplicateProductRows ?? 0}
                    warn={(previewResult.summary.duplicateProductRows ?? 0) > 0}
                  />
                  <SummaryStat
                    label="Invalid Rows"
                    value={previewResult.summary.invalidRows ?? 0}
                    warn={(previewResult.summary.invalidRows ?? 0) > 0}
                  />
                  <SummaryStat
                    label="With Expiry"
                    value={previewResult.summary.productsWithExpiry ?? 0}
                  />
                  <SummaryStat
                    label="Without Expiry"
                    value={previewResult.summary.productsWithoutExpiry ?? 0}
                  />
                  <SummaryStat
                    label="Expired"
                    value={previewResult.summary.expiredProducts ?? 0}
                    warn={(previewResult.summary.expiredProducts ?? 0) > 0}
                  />
                  <SummaryStat
                    label="Expiring Soon (30d)"
                    value={previewResult.summary.expiringSoon ?? 0}
                    warn={(previewResult.summary.expiringSoon ?? 0) > 0}
                  />
                  <SummaryStat
                    label="Total Stock Imported"
                    value={previewResult.summary.totalImportedStock ?? 0}
                  />
                  <SummaryStat
                    label="Purchase Value"
                    value={`GH₵${(previewResult.summary.purchaseValue ?? 0).toFixed(2)}`}
                  />
                  <SummaryStat
                    label="Selling Value"
                    value={`GH₵${(previewResult.summary.sellingValue ?? 0).toFixed(2)}`}
                  />
                </div>
              </div>
            )}

            {/* Category mapping report */}
            {previewResult &&
              previewResult.categoryMapping &&
              previewResult.categoryMapping.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Category Mapping</CardTitle>
                    <CardDescription className="text-xs">
                      Categories are matched by name, ignoring case and extra spaces. Unmatched
                      categories will be created and activated.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="p-2">CSV Category</th>
                          <th className="p-2">Existing Category</th>
                          <th className="p-2">New Category</th>
                          <th className="p-2 text-right">Products</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.categoryMapping.map((c) => (
                          <tr key={c.csvCategory} className="border-t">
                            <td className="p-2 font-medium">{c.csvCategory}</td>
                            <td className="p-2 text-muted-foreground">
                              {c.existingCategoryName ?? "—"}
                            </td>
                            <td className="p-2">
                              {c.willCreate ? (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <PlusCircle className="h-3 w-3" /> Will create
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-2 text-right">{c.productCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

            {/* Duplicate-run warning: this exact product/stock/price/expiry set
                was already committed under a different batch. */}
            {previewResult && previewResult.possibleDuplicateOf && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Possible duplicate import
                </div>
                <p className="text-xs text-rose-700 dark:text-rose-400">
                  The exact same products, quantities, prices and expiry dates were already
                  committed as "{previewResult.possibleDuplicateOf.filename}" on{" "}
                  {new Date(previewResult.possibleDuplicateOf.committedAt).toLocaleString("en-GH")}.
                  Committing this import too would add the stock a second time.
                </p>
                <label className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400">
                  <Checkbox
                    checked={forceDuplicate}
                    onCheckedChange={(v) => setForceDuplicate(v === true)}
                  />
                  I understand — import anyway
                </label>
              </div>
            )}

            {/* Progress bar during commit */}
            {isCommitting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Importing products…</span>
                  <span>{commitProgress}%</span>
                </div>
                <Progress value={commitProgress} className="h-2" />
              </div>
            )}

            {/* Commit / Rollback actions */}
            {previewResult && !committedBatchId && (
              <div className="flex gap-2">
                <Button
                  onClick={commitImport}
                  disabled={isCommitting || checkedCount === 0}
                  className="flex-1"
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {checkedInsertCount > 0 && checkedUpdateCount > 0
                        ? `Import ${checkedInsertCount} + update ${checkedUpdateCount}`
                        : checkedUpdateCount > 0
                          ? `Update ${checkedUpdateCount} product${checkedUpdateCount !== 1 ? "s" : ""}`
                          : `Import ${checkedInsertCount} product${checkedInsertCount !== 1 ? "s" : ""}`}
                      {skippedErrors > 0 &&
                        ` (${skippedErrors} error row${skippedErrors !== 1 ? "s" : ""} skipped)`}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={clearFile} disabled={isCommitting}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Success state with rollback */}
            {committedBatchId && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-emerald-700 dark:text-emerald-300">
                      Import committed successfully
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {commitSummary && (
                        <>
                          {commitSummary.importedCount > 0 &&
                            `${commitSummary.importedCount} inserted`}
                          {commitSummary.importedCount > 0 &&
                            commitSummary.updatedCount > 0 &&
                            ", "}
                          {commitSummary.updatedCount > 0 &&
                            `${commitSummary.updatedCount} updated`}
                          {" · "}
                        </>
                      )}
                      Batch ID: <code className="font-mono">{committedBatchId.split("-")[0]}…</code>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRollbackConfirm(true)}
                    className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Undo Import
                  </Button>
                  <Button size="sm" onClick={clearFile} className="flex-1">
                    Import another file
                  </Button>
                </div>
              </div>
            )}

            {/* File-level warnings banner */}
            {previewResult && previewResult.fileWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  File warnings
                </div>
                {previewResult.fileWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400 pl-6">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* Preview Table */}
            {previewResult && previewResult.rows.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Preview — {previewResult.rows.length} row
                    {previewResult.rows.length !== 1 ? "s" : ""}
                    {previewResult.templateVersion && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Template v{previewResult.templateVersion}
                      </Badge>
                    )}
                    {previewResult.importMode !== "insert" &&
                      effectiveSummary &&
                      effectiveSummary.updates > 0 && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px] border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-900/20"
                        >
                          <PencilLine className="h-2.5 w-2.5 mr-1" />
                          {effectiveSummary.updates} will update
                        </Badge>
                      )}
                    {editedRows.size > 0 && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] border-violet-200 text-violet-700 bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:bg-violet-900/20"
                      >
                        <PencilLine className="h-2.5 w-2.5 mr-1" />
                        {editedRows.size} edited
                      </Badge>
                    )}
                  </CardTitle>
                  {editedRows.size === 0 && effectiveSummary && effectiveSummary.errors > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Click any cell in a row to edit its value inline and fix errors before
                      importing.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="pl-3 pr-1 py-2 w-8">
                            <Checkbox
                              checked={
                                displayedRows.length > 0 &&
                                displayedRows.every((r) => checkedRows.has(r.rowNum))
                              }
                              onCheckedChange={toggleCheckAll}
                              aria-label="Select all rows"
                            />
                          </th>
                          <th className="px-3 py-2 text-left w-8">#</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left min-w-[160px]">Product Name</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-left w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map((row) => {
                          const isMatch = row.matchedExistingId !== null;
                          const isEdited = editedRows.has(row.rowNum);

                          const makeEditableCell = (
                            field: string,
                            value: string,
                            className?: string,
                            inputClassName?: string,
                          ) => {
                            const isActiveCell =
                              editingCell?.rowNum === row.rowNum && editingCell?.field === field;
                            if (isActiveCell) {
                              // Prefer the raw string the admin typed (from editedRows) so invalid
                              // values like "abc" or "1,000" remain visible instead of the
                              // parsed fallback (e.g. 0) that was stored in row.data.
                              const rawStored = editedRows.get(row.rowNum)?.[field];
                              const inputDefaultValue = rawStored !== undefined ? rawStored : value;
                              return (
                                <input
                                  autoFocus
                                  defaultValue={inputDefaultValue}
                                  className={`w-full px-1.5 py-0.5 border border-primary rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs ${inputClassName ?? ""}`}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      saveEdit(row.rowNum, field, e.currentTarget.value);
                                    }
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  onBlur={(e) => saveEdit(row.rowNum, field, e.currentTarget.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              );
                            }
                            return (
                              <span
                                className={`group/cell inline-flex items-center gap-1 cursor-text rounded px-1 -mx-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${className ?? ""}`}
                                title="Click to edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell({ rowNum: row.rowNum, field });
                                }}
                              >
                                {value || (
                                  <span className="text-muted-foreground/50 italic text-[10px]">
                                    click to edit
                                  </span>
                                )}
                                <PencilLine className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                              </span>
                            );
                          };

                          return (
                            <Fragment key={row.rowNum}>
                              <tr
                                className={`border-b cursor-pointer transition-colors hover:brightness-95 ${rowBg(row.status, isMatch)}`}
                                onClick={() => toggleRow(row.rowNum)}
                              >
                                <td className="pl-3 pr-1 py-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={checkedRows.has(row.rowNum)}
                                    onCheckedChange={() => toggleCheck(row.rowNum)}
                                    aria-label={`Select row ${row.rowNum}`}
                                  />
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <RowStatusIcon status={row.status} isMatch={isMatch} />
                                    {isMatch && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-900/20"
                                      >
                                        will update
                                      </Badge>
                                    )}
                                    {isEdited && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 border-violet-200 text-violet-700 bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:bg-violet-900/20"
                                      >
                                        edited
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td
                                  className="px-3 py-1.5 font-medium max-w-[200px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {makeEditableCell("name", row.data.name)}
                                </td>
                                <td
                                  className="px-3 py-1.5 text-muted-foreground font-mono"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {makeEditableCell("sku", row.data.sku || "")}
                                </td>
                                <td
                                  className="px-3 py-1.5 text-muted-foreground max-w-[120px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {makeEditableCell("category", row.data.category || "")}
                                </td>
                                <td
                                  className="px-3 py-1.5 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="inline-flex items-center gap-0.5 justify-end">
                                    <span className="text-muted-foreground">₵</span>
                                    {makeEditableCell(
                                      "price",
                                      row.data.price ?? "",
                                      "text-right",
                                      "text-right",
                                    )}
                                  </span>
                                </td>
                                <td
                                  className="px-3 py-1.5 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {makeEditableCell(
                                    "stock",
                                    String(row.data.stock),
                                    "text-right",
                                    "text-right",
                                  )}
                                </td>
                                <td
                                  className="px-3 py-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRow(row.rowNum);
                                  }}
                                >
                                  {expandedRows.has(row.rowNum) ? (
                                    <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </td>
                              </tr>
                              {expandedRows.has(row.rowNum) && (
                                <tr
                                  key={`${row.rowNum}-details`}
                                  className={rowBg(row.status, isMatch)}
                                >
                                  <td colSpan={9} className="px-3 pb-3">
                                    <div className="space-y-2 mt-1">
                                      {/* Before/after field diff for matched (update) rows */}
                                      {isMatch &&
                                        row.prevValues &&
                                        (() => {
                                          const prev = row.prevValues;
                                          const next = row.data;
                                          const priceFields = new Set([
                                            "price",
                                            "sellingPrice",
                                            "wholesalePrice",
                                          ]);
                                          const fmtVal = (
                                            key: string,
                                            val: string | number | null | undefined,
                                          ): string => {
                                            if (val == null || val === "") return "—";
                                            if (priceFields.has(key)) {
                                              const n = parseFloat(String(val));
                                              return isNaN(n) ? String(val) : `₵${n.toFixed(2)}`;
                                            }
                                            return String(val);
                                          };
                                          const valuesEqual = (
                                            key: string,
                                            a: string | number | null | undefined,
                                            b: string | number | null | undefined,
                                          ): boolean => {
                                            if (a == null || a === "") a = null;
                                            if (b == null || b === "") b = null;
                                            if (a === null && b === null) return true;
                                            if (a === null || b === null) return false;
                                            if (priceFields.has(key)) {
                                              const na = parseFloat(String(a)),
                                                nb = parseFloat(String(b));
                                              return (
                                                !isNaN(na) &&
                                                !isNaN(nb) &&
                                                Math.abs(na - nb) < 0.001
                                              );
                                            }
                                            return String(a).trim() === String(b).trim();
                                          };
                                          type DiffField = {
                                            key: keyof typeof next;
                                            label: string;
                                          };
                                          const DIFF_FIELDS: DiffField[] = [
                                            { key: "name", label: "Product Name" },
                                            { key: "price", label: "Selling Price" },
                                            { key: "cost", label: "Purchase Price" },
                                            { key: "sellingPrice", label: "Legacy Selling" },
                                            { key: "wholesalePrice", label: "Wholesale Price" },
                                            { key: "category", label: "Category" },
                                            { key: "brand", label: "Brand" },
                                            { key: "unit", label: "Unit of Measure" },
                                            { key: "reorderPoint", label: "Reorder Point" },
                                            { key: "expiryDate", label: "Expiry Date" },
                                            { key: "batchLotNumber", label: "Batch / Lot No." },
                                            { key: "description", label: "Description" },
                                            { key: "sku", label: "SKU" },
                                            { key: "barcode", label: "Barcode / QR" },
                                          ];

                                          const diffRows = DIFF_FIELDS.filter(({ key }) => {
                                            const oldVal = prev[key as keyof typeof prev];
                                            const newVal = next[key as keyof typeof next];
                                            return (
                                              (oldVal != null && oldVal !== "") ||
                                              (newVal != null && newVal !== "")
                                            );
                                          });
                                          const changedCount = diffRows.filter(
                                            ({ key }) =>
                                              !valuesEqual(
                                                key,
                                                prev[key as keyof typeof prev] as
                                                  | string
                                                  | number
                                                  | null,
                                                next[key as keyof typeof next] as
                                                  | string
                                                  | number
                                                  | null,
                                              ),
                                          ).length;
                                          return (
                                            <div className="rounded-md border border-blue-200 dark:border-blue-800 overflow-hidden">
                                              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800">
                                                <PencilLine className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                                  Matched product #{row.matchedExistingId} —{" "}
                                                  {changedCount} field
                                                  {changedCount !== 1 ? "s" : ""} will change
                                                </span>
                                              </div>
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="bg-muted/40">
                                                    <th className="text-left font-medium text-muted-foreground px-3 py-1 w-32">
                                                      Field
                                                    </th>
                                                    <th className="text-left font-medium text-muted-foreground px-3 py-1">
                                                      Current (DB)
                                                    </th>
                                                    <th className="text-left font-medium text-muted-foreground px-3 py-1">
                                                      Import (new)
                                                    </th>
                                                    <th className="px-2 py-1 w-20 text-right font-medium text-muted-foreground">
                                                      Status
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border">
                                                  {diffRows.map(({ key, label }) => {
                                                    const oldVal = prev[
                                                      key as keyof typeof prev
                                                    ] as string | number | null;
                                                    const newVal = next[
                                                      key as keyof typeof next
                                                    ] as string | number | null;
                                                    const changed = !valuesEqual(
                                                      key,
                                                      oldVal,
                                                      newVal,
                                                    );
                                                    const willUpdate =
                                                      changed && overwriteFields.has(key);
                                                    const locked =
                                                      changed && !overwriteFields.has(key);
                                                    return (
                                                      <tr
                                                        key={key}
                                                        className={
                                                          willUpdate
                                                            ? "bg-amber-50 dark:bg-amber-950/25"
                                                            : ""
                                                        }
                                                      >
                                                        <td className="px-3 py-1 font-medium text-muted-foreground whitespace-nowrap">
                                                          {label}
                                                        </td>
                                                        <td
                                                          className={`px-3 py-1 ${changed ? "text-foreground" : "text-muted-foreground"}`}
                                                        >
                                                          {fmtVal(key, oldVal)}
                                                        </td>
                                                        <td
                                                          className={`px-3 py-1 ${willUpdate ? "font-medium text-amber-700 dark:text-amber-400" : changed && locked ? "text-muted-foreground line-through" : "text-muted-foreground"}`}
                                                        >
                                                          {fmtVal(key, newVal)}
                                                        </td>
                                                        <td className="px-2 py-1 text-right">
                                                          {willUpdate && (
                                                            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 text-[10px] font-medium">
                                                              changed
                                                            </span>
                                                          )}
                                                          {locked && (
                                                            <span
                                                              className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-1.5 text-[10px]"
                                                              title="Not selected in field overwrite settings"
                                                            >
                                                              locked
                                                            </span>
                                                          )}
                                                          {!changed && (
                                                            <span className="text-[10px] text-muted-foreground/50">
                                                              same
                                                            </span>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          );
                                        })()}
                                      {/* Stock is always additive, never a masked field — shown
                                          separately from the overwrite-field diff table above. */}
                                      {isMatch && row.prevValues && row.data.stock > 0 && (
                                        <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 px-3 py-1.5 flex items-center gap-3 text-xs">
                                          <span className="text-muted-foreground">
                                            Current stock{" "}
                                            <strong className="text-foreground">
                                              {row.prevValues.stock}
                                            </strong>
                                          </span>
                                          <span className="text-muted-foreground">+</span>
                                          <span className="text-muted-foreground">
                                            Importing{" "}
                                            <strong className="text-emerald-700 dark:text-emerald-400">
                                              {row.data.stock}
                                            </strong>
                                          </span>
                                          <span className="text-muted-foreground">=</span>
                                          <span>
                                            Final stock{" "}
                                            <strong>
                                              {row.finalStock ??
                                                row.prevValues.stock + row.data.stock}
                                            </strong>
                                          </span>
                                        </div>
                                      )}
                                      {/* Fallback if prevValues not available */}
                                      {isMatch && !row.prevValues && (
                                        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                          <PencilLine className="h-3.5 w-3.5 shrink-0" />
                                          <span>
                                            Matched existing product (ID {row.matchedExistingId}) —
                                            will be updated on commit
                                          </span>
                                        </div>
                                      )}
                                      {row.errors.map((e, i) => (
                                        <div
                                          key={i}
                                          className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400"
                                        >
                                          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                          <span>{e}</span>
                                        </div>
                                      ))}
                                      {row.warnings.map((w, i) => {
                                        const suppressed = isWarningSuppressed(w);
                                        return (
                                          <div
                                            key={i}
                                            className={`flex items-start gap-1.5 ${suppressed ? "opacity-40" : "text-amber-600 dark:text-amber-400"}`}
                                          >
                                            <AlertTriangle
                                              className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${suppressed ? "text-muted-foreground" : ""}`}
                                            />
                                            <span
                                              className={
                                                suppressed
                                                  ? "line-through text-muted-foreground"
                                                  : ""
                                              }
                                            >
                                              {w}
                                            </span>
                                            {suppressed ? (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  unsuppressWarning(getWarningKey(w));
                                                }}
                                                className="ml-auto shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline leading-tight"
                                                title="Un-suppress this warning"
                                              >
                                                restore
                                              </button>
                                            ) : (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  suppressWarning(w);
                                                }}
                                                className="ml-auto shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-amber-700 leading-tight"
                                                title="Suppress this warning type on future previews"
                                              >
                                                <EyeOff className="h-2.5 w-2.5" />
                                                suppress
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {!isMatch &&
                                        row.errors.length === 0 &&
                                        row.warnings.length === 0 && (
                                          <div className="flex items-center gap-1.5 text-emerald-600">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            <span>All checks passed</span>
                                          </div>
                                        )}
                                      {!isMatch && (
                                        <div className="grid grid-cols-3 gap-2 mt-1 text-muted-foreground text-xs">
                                          {row.data.brand && <span>Brand: {row.data.brand}</span>}
                                          {row.data.barcode && (
                                            <span>Barcode: {row.data.barcode}</span>
                                          )}
                                          {row.data.sellingPrice && (
                                            <span>Selling: ₵{row.data.sellingPrice}</span>
                                          )}
                                          {row.data.wholesalePrice && (
                                            <span>Wholesale: ₵{row.data.wholesalePrice}</span>
                                          )}
                                          {row.data.unit && <span>Unit: {row.data.unit}</span>}
                                          {row.data.supplier && (
                                            <span>Supplier: {row.data.supplier}</span>
                                          )}
                                          {row.data.taxInfo && (
                                            <span>Tax Info: {row.data.taxInfo}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {previewResult.rows.length > 50 && (
                    <div className="p-3 border-t text-center">
                      <button
                        onClick={() => setShowAllRows(!showAllRows)}
                        className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                      >
                        {showAllRows ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Show fewer rows
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> Show all {previewResult.rows.length}{" "}
                            rows (showing 50)
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Rollback confirmation */}
      <AlertDialog open={showRollbackConfirm} onOpenChange={setShowRollbackConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Inserted products will be permanently deleted. Products that were updated will be
              restored to their previous values. This cannot be undone after the rollback completes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={rollbackImport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rolling back…
                </>
              ) : (
                "Yes, undo import"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
