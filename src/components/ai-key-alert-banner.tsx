import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KeyAlert {
  id: string;
  source: string;
  upstream_status: number;
  created_at: string;
}

export function AiKeyAlertBanner() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<KeyAlert[]>([]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("ai_key_alerts")
        .select("id, source, upstream_status, created_at")
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!cancelled && data) setAlerts(data as KeyAlert[]);
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAdmin]);

  if (!isAdmin || alerts.length === 0) return null;

  const acknowledgeAll = async () => {
    const ids = alerts.map((a) => a.id);
    await supabase
      .from("ai_key_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .in("id", ids);
    setAlerts([]);
  };

  const latest = alerts[0];

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 text-amber-100 px-4 py-2 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
      <div className="flex-1 text-sm">
        <span className="font-semibold">AI key authentication failure</span>
        {" — "}
        {alerts.length} unresolved alert{alerts.length > 1 ? "s" : ""}. Latest: {latest.source} returned{" "}
        <span className="font-mono">{latest.upstream_status}</span>. The <code>LOVABLE_API_KEY</code> may need rotation.
        After rotating, copy the new <code>AI_PROXY_SECRET</code> into Hostinger hPanel env vars.
      </div>
      <Button size="sm" variant="ghost" className="text-amber-100 hover:bg-amber-500/20" onClick={acknowledgeAll}>
        <X className="h-3.5 w-3.5 mr-1" /> Dismiss
      </Button>
    </div>
  );
}
