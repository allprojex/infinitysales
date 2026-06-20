import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

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
        const warehouseId = url.searchParams.get("warehouseId");
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
          .select("id,user_id,warehouse_id,total,items,sold_at")
          .order("sold_at", { ascending: false })
          .limit(5000);

        if (!isPrivileged) {
          salesQ = salesQ.eq("user_id", user.id);
        } else if (userIdFilter) {
          salesQ = salesQ.eq("user_id", userIdFilter);
        }
        if (startDate) salesQ = salesQ.gte("sold_at", startDate);
        if (endDate) salesQ = salesQ.lte("sold_at", endDate + "T23:59:59.999Z");

        const { data: sales, error } = await salesQ;
        if (error) return errorJson(500, error.message);
        const rows = sales ?? [];

        // Collect needed product ids and user/warehouse ids.
        const productIds = new Set<string>();
        const warehouseIds = new Set<string>();
        const userIds = new Set<string>();
        for (const s of rows as any[]) {
          if (s.warehouse_id) warehouseIds.add(s.warehouse_id);
          if (s.user_id) userIds.add(s.user_id);
          const items = Array.isArray(s.items) ? s.items : [];
          for (const it of items) {
            const pid = it?.productId ?? it?.product_id ?? it?.id;
            if (pid) productIds.add(String(pid));
          }
        }

        const [productsRes, whRes, profilesRes] = await Promise.all([
          productIds.size
            ? (sb as any).from("products").select("id,category,warehouse_id").in("id", Array.from(productIds))
            : Promise.resolve({ data: [] as any[] }),
          warehouseIds.size
            ? (sb as any).from("warehouses").select("id,name").in("id", Array.from(warehouseIds))
            : Promise.resolve({ data: [] as any[] }),
          userIds.size
            ? (sb as any).from("profiles").select("auth_id,name,email").in("auth_id", Array.from(userIds))
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const productMap = new Map<string, { category: string | null; warehouseId: string | null }>();
        for (const p of (productsRes as any).data ?? []) {
          productMap.set(String(p.id), { category: p.category ?? null, warehouseId: p.warehouse_id ?? null });
        }
        const whMap = new Map<string, string>();
        for (const w of (whRes as any).data ?? []) whMap.set(String(w.id), w.name);
        const userMap = new Map<string, string>();
        for (const p of (profilesRes as any).data ?? []) {
          userMap.set(String(p.auth_id), p.name ?? p.email ?? "—");
        }

        // Aggregate per (user, warehouse, category)
        const bucketMap = new Map<string, Row>();
        // For per-sale single-counting, track which sale id has been counted per bucket
        const countedSales = new Map<string, Set<string>>();
        for (const s of rows as any[]) {
          const items = Array.isArray(s.items) ? s.items : [];
          if (!items.length) continue;
          const saleTotal = Number(s.total ?? 0);
          const saleQty = items.reduce((sum: number, it: any) => sum + Number(it.quantity ?? it.qty ?? 0), 0) || 1;

          for (const it of items) {
            const pid = String(it?.productId ?? it?.product_id ?? it?.id ?? "");
            const prod = productMap.get(pid);
            const cat = prod?.category ?? "Uncategorized";
            const wId = s.warehouse_id ?? prod?.warehouseId ?? null;

            if (warehouseId && wId !== warehouseId) continue;
            if (category && cat !== category) continue;

            const qty = Number(it.quantity ?? it.qty ?? 0);
            const lineRevenue = saleTotal * (qty / saleQty);

            const key = `${s.user_id}|${wId ?? "none"}|${cat}`;
            let bucket = bucketMap.get(key);
            if (!bucket) {
              bucket = {
                userId: s.user_id,
                soldBy: userMap.get(s.user_id) ?? "—",
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
            bucket.itemsSold += qty;
            bucket.totalAmount += lineRevenue;
            const seen = countedSales.get(key)!;
            if (!seen.has(s.id)) {
              seen.add(s.id);
              bucket.salesCount += 1;
            }
          }
        }

        const result = Array.from(bucketMap.values())
          .map((r) => ({ ...r, totalAmount: Math.round(r.totalAmount * 100) / 100 }))
          .sort((a, b) => b.totalAmount - a.totalAmount);

        // Available filter options (warehouses + categories) that appeared in the period.
        const warehouseOptions = Array.from(new Set(result.map((r) => r.warehouseId).filter(Boolean))).map((id) => ({
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
          options: { warehouses: warehouseOptions, categories: categoryOptions, users: userOptions },
          isPrivileged,
        });
      },
    },
  },
});
