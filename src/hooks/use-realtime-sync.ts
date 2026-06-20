import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mount once at the app shell. Subscribes to postgres_changes on the
 * transactional tables and invalidates the affected TanStack Query keys so
 * dashboard KPIs, POS, sales, purchases, and inventory stay in sync without
 * a page refresh.
 *
 * RLS still gates which rows each user sees; this only piggybacks on the
 * already-allowed change stream.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const invalidateSales = () => {
      qc.invalidateQueries({ predicate: (q) => {
        const k0 = String(q.queryKey?.[0] ?? "");
        return (
          k0.includes("/api/reports") ||
          k0.includes("/api/sales") ||
          k0.includes("recent-sales") ||
          k0.includes("top-products") ||
          k0.includes("top-customers") ||
          k0.includes("channel-breakdown") ||
          k0.includes("revenue-over-time") ||
          k0.includes("report-summary") ||
          k0.includes("purchases-summary") ||
          k0.includes("dead-stock")
        );
      }});
    };
    const invalidatePurchases = () => {
      qc.invalidateQueries({ predicate: (q) => {
        const k0 = String(q.queryKey?.[0] ?? "");
        return (
          k0.includes("/api/reports") ||
          k0.includes("/api/purchase") ||
          k0.includes("purchase-orders") ||
          k0.includes("purchases-summary") ||
          k0.includes("/api/products") ||
          k0.includes("report-summary")
        );
      }});
    };
    const invalidateInventory = () => {
      qc.invalidateQueries({ predicate: (q) => {
        const k0 = String(q.queryKey?.[0] ?? "");
        return (
          k0.includes("/api/products") ||
          k0.includes("/api/reports") ||
          k0.includes("dead-stock") ||
          k0.includes("report-summary")
        );
      }});
    };
    const invalidateCash = () => {
      qc.invalidateQueries({ predicate: (q) => {
        const k0 = String(q.queryKey?.[0] ?? "");
        return (
          k0.includes("/api/cash") ||
          k0.includes("/api/reports") ||
          k0.includes("report-summary")
        );
      }});
    };

    (async () => {
      // Scope the realtime channel per-user so the realtime.messages RLS
      // policy can deny cross-user subscriptions. Without a uid in the
      // topic, any authenticated user could attach to the shared channel.
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      channel = supabase
        .channel(`app-realtime-sync:${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, invalidateSales)
        .on("postgres_changes", { event: "*", schema: "public", table: "sales_returns" }, invalidateSales)
        .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, invalidatePurchases)
        .on("postgres_changes", { event: "*", schema: "public", table: "purchase_returns" }, invalidatePurchases)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, invalidateInventory)
        .on("postgres_changes", { event: "*", schema: "public", table: "stock_adjustments" }, invalidateInventory)
        .on("postgres_changes", { event: "*", schema: "public", table: "product_transfers" }, invalidateInventory)
        .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, invalidateCash)
        .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions" }, invalidateCash)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);
}

