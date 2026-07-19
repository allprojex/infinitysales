import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Counts = {
  products?: number;
  customers?: number;
  suppliers?: number;
  sales?: number;
  purchaseOrders?: number;
};

type Result = {
  action: "seed" | "cleanup";
  at: string;
  success: boolean;
  counts: Counts;
  errors: string[];
  marker?: string;
  stamp?: number;
};

async function callSmokeTest(method: "POST" | "DELETE") {
  const token = window.localStorage.getItem("accessToken");
  const res = await fetch("/api/admin/smoke-test", {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body as {
    success: boolean;
    created?: Counts;
    removed?: Counts;
    errors?: string[];
    marker?: string;
    stamp?: number;
  };
}

const COUNT_LABELS: Array<[keyof Counts, string]> = [
  ["products", "Products"],
  ["customers", "Customers"],
  ["suppliers", "Suppliers"],
  ["sales", "Sales"],
  ["purchaseOrders", "Purchase Orders"],
];

export function SmokeTestPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pending, setPending] = useState<"seed" | "cleanup" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (action: "seed" | "cleanup") => {
    setPending(action);
    try {
      const body = await callSmokeTest(action === "seed" ? "POST" : "DELETE");
      const counts = (action === "seed" ? body.created : body.removed) ?? {};
      const next: Result = {
        action,
        at: new Date().toISOString(),
        success: !!body.success,
        counts,
        errors: body.errors ?? [],
        marker: body.marker,
        stamp: body.stamp,
      };
      setResult(next);
      toast({
        title: action === "seed" ? "Smoke-test data seeded" : "Smoke-test data cleaned up",
        description: COUNT_LABELS.map(([k, label]) => `${label}: ${counts[k] ?? 0}`).join("  •  "),
        variant: next.errors.length ? "destructive" : "default",
      });
      // Refresh the dashboard notification bell + Notifications page so the
      // event emitted by the seed/cleanup run appears immediately.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        qc.invalidateQueries({ queryKey: ["notifications-summary"] }),
        qc.invalidateQueries({ queryKey: ["notifications-recent"] }),
      ]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: action === "seed" ? "Seed failed" : "Cleanup failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Smoke-test data
            <Badge variant="secondary" className="text-[10px]">
              Admin
            </Badge>
          </CardTitle>
          <CardDescription>
            Seed a marked slice of products, customers, suppliers, sales and purchase orders to
            exercise every flow end-to-end. Cleanup removes only rows tagged with the smoke-test
            marker.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => run("seed")}
            disabled={pending !== null}
            className="gap-2"
          >
            {pending === "seed" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Seed data
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => run("cleanup")}
            disabled={pending !== null}
            className="gap-2"
          >
            {pending === "cleanup" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Cleanup
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {result.success && result.errors.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span className="font-medium">
                {result.action === "seed" ? "Last seed" : "Last cleanup"}
              </span>
              <span className="text-muted-foreground">{new Date(result.at).toLocaleString()}</span>
              {result.marker && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  marker: {result.marker}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {COUNT_LABELS.map(([key, label]) => (
                <div
                  key={key}
                  className="rounded-md border bg-muted/30 p-3 text-center"
                  data-testid={`smoke-count-${key}`}
                >
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-2xl font-bold tabular-nums">{result.counts[key] ?? 0}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              A dashboard notification was emitted as{" "}
              <code className="font-mono">type: "system"</code> with severity{" "}
              <code className="font-mono">{result.errors.length ? "warning" : "success"}</code>.
              Open the Notifications page to view it.
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <div className="font-medium text-destructive mb-1">
                  Errors ({result.errors.length})
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-destructive/90">
                  {result.errors.map((err, i) => (
                    <li key={i} className="font-mono break-all">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No smoke-test run yet. Click <strong>Seed data</strong> to create sample rows, then{" "}
            <strong>Cleanup</strong> to remove them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
