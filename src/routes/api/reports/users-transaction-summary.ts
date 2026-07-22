import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";
import { resolveWarehouseUuid } from "../-stock-helpers";
import { loadCanonicalSaleLines } from "./-canonical-lines";

type Row = {
  userId: string;
  soldBy: string;
  warehouseId: string | null;
  warehouseName: string;
  category: string;
  itemsSold: number;
  totalAmount: number;
  salesCount: number;
};

export const Route = createFileRoute("/api/reports/users-transaction-summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;

        const url = new URL(request.url);
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");
        const warehouseIdParam = url.searchParams.get("warehouseId");
        const category = url.searchParams.get("category");
        const userIdFilter = url.searchParams.get("userId");

        // Role check — admins and managers see everyone, others see only themselves.
        const { data: roleRows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roles = new Set((roleRows ?? []).map((r: any) => r.role));
        const isPrivileged = roles.has("admin") || roles.has("manager");

        let salesQ = sb
          .from("sales")
          .select("id,user_id,sold_at")
          .eq("status", "completed")
          .order("sold_at", { ascending: false })
          .limit(5000);

        if (!isPrivileged) {
          salesQ = salesQ.eq("user_id", user.id);
        } else if (userIdFilter) {
          salesQ = salesQ.eq("user_id", userIdFilter);
        }
        let normalizedWarehouseId: string | null = null;
        if (warehouseIdParam) {
          const resolved = await resolveWarehouseUuid(user.id, warehouseIdParam);
          if (resolved.error) return errorJson(404, resolved.error);
          normalizedWarehouseId = resolved.warehouseId;
        }

        if (startDate) salesQ = salesQ.gte("sold_at", startDate);
        if (endDate) salesQ = salesQ.lte("sold_at", endDate + "T23:59:59.999Z");
        const { data: sales, error } = await salesQ;
        if (error) return errorJson(500, error.message);
        const rows = sales ?? [];
        const canonical = await loadCanonicalSaleLines(
          rows.map((sale) => String(sale.id)),
          "id,sale_id,warehouse_id,category_name,quantity,total_amount",
        );
        if (canonical.error) return errorJson(500, canonical.error);

        // Names are presentation metadata; historical location/category IDs
        // and financial values come exclusively from immutable sale_lines.
        const warehouseIds = new Set<string>();
        const userIds = new Set<string>();
        for (const s of rows as any[]) {
          if (s.user_id) userIds.add(s.user_id);
        }
        for (const line of canonical.lines)
          if (line.warehouse_id) warehouseIds.add(String(line.warehouse_id));

        const [whRes, profilesRes] = await Promise.all([
          warehouseIds.size
            ? (sb as any)
                .from("warehouses")
                .select("id,uuid_id,name")
                .in("uuid_id", Array.from(warehouseIds))
            : Promise.resolve({ data: [] as any[] }),
          userIds.size
            ? (sb as any)
                .from("profiles")
                .select("auth_id,name,email")
                .in("auth_id", Array.from(userIds))
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const whMap = new Map<string, string>();
        for (const w of (whRes as any).data ?? []) {
          whMap.set(String(w.uuid_id ?? w.id), w.name);
          whMap.set(String(w.id), w.name);
        }
        const userMap = new Map<string, string>();
        for (const p of (profilesRes as any).data ?? []) {
          userMap.set(String(p.auth_id), p.name ?? p.email ?? "—");
        }

        // Aggregate per (user, warehouse, category)
        const bucketMap = new Map<string, Row>();
        // For per-sale single-counting, track which sale id has been counted per bucket
        const countedSales = new Map<string, Set<string>>();
        const saleById = new Map(rows.map((sale: any) => [String(sale.id), sale]));
        for (const line of canonical.lines) {
          const sale = saleById.get(String(line.sale_id));
          if (!sale || line.quantity == null || line.total_amount == null) continue;
          const cat = String(line.category_name ?? "Unknown");
          const wId = line.warehouse_id ? String(line.warehouse_id) : null;
          if (normalizedWarehouseId && wId !== normalizedWarehouseId) continue;
          if (category && cat !== category) continue;

          const key = `${sale.user_id}|${wId ?? "none"}|${cat}`;
          let bucket = bucketMap.get(key);
          if (!bucket) {
            bucket = {
              userId: sale.user_id,
              soldBy: userMap.get(sale.user_id) ?? "—",
              warehouseId: wId,
              warehouseName: wId ? (whMap.get(wId) ?? "—") : "—",
              category: cat,
              itemsSold: 0,
              totalAmount: 0,
              salesCount: 0,
            };
            bucketMap.set(key, bucket);
            countedSales.set(key, new Set());
          }
          bucket.itemsSold += Number(line.quantity);
          bucket.totalAmount += Number(line.total_amount);
          const seen = countedSales.get(key)!;
          if (!seen.has(String(sale.id))) {
            seen.add(String(sale.id));
            bucket.salesCount += 1;
          }
        }

        const result = Array.from(bucketMap.values())
          .map((r) => ({ ...r, totalAmount: Math.round(r.totalAmount * 100) / 100 }))
          .sort((a, b) => b.totalAmount - a.totalAmount);

        // Available filter options (warehouses + categories) that appeared in the period.
        const warehouseOptions = Array.from(
          new Set(result.map((r) => r.warehouseId).filter(Boolean)),
        ).map((id) => ({
          id,
          name: whMap.get(id as string) ?? "—",
        }));
        const categoryOptions = Array.from(new Set(result.map((r) => r.category)));
        const userOptions = isPrivileged
          ? Array.from(new Set(result.map((r) => r.userId))).map((id) => ({
              id,
              name: userMap.get(id) ?? "—",
            }))
          : [];

        return json({
          rows: result,
          period: { startDate, endDate },
          options: {
            warehouses: warehouseOptions,
            categories: categoryOptions,
            users: userOptions,
          },
          isPrivileged,
        });
      },
    },
  },
});
