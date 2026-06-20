import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

type Item = { productId?: string; name?: string; category?: string; quantity?: number; price?: number; total?: number };

export const Route = createFileRoute("/api/reports/top-products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 100);
        const { data: sales, error } = await sb.from("sales").select("items, status").eq("user_id", user.id).eq("status", "completed");
        if (error) return errorJson(500, error.message);
        const agg = new Map<string, { id: string; name: string; category: string | null; unitsSold: number; revenue: number }>();
        for (const s of sales ?? []) {
          const items: Item[] = Array.isArray(s.items) ? (s.items as any) : [];
          for (const it of items) {
            const key = (it.productId ?? it.name ?? "unknown") as string;
            const qty = Number(it.quantity ?? 0);
            const rev = Number(it.total ?? (Number(it.price ?? 0) * qty));
            const a = agg.get(key) ?? { id: key, name: it.name ?? key, category: it.category ?? null, unitsSold: 0, revenue: 0 };
            a.unitsSold += qty;
            a.revenue += rev;
            agg.set(key, a);
          }
        }
        const rows = Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
        return json(rows);
      },
    },
  },
});
