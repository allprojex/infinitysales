import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/expired-inventory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const alertDays = parseInt(url.searchParams.get("alertDays") ?? "30", 10) || 30;
        const cutoff = new Date(Date.now() + alertDays * 86400000).toISOString().slice(0, 10);
        const { data, error } = await sb.from("products").select("id, name, sku, category, stock, price, expiry_date").not("expiry_date", "is", null).lte("expiry_date", cutoff);
        if (error) return errorJson(500, error.message);
        const today = new Date().toISOString().slice(0, 10);
        const items = (data ?? []).map(p => ({
          id: p.id, name: p.name, sku: p.sku, category: p.category,
          stock: Number(p.stock ?? 0), price: Number(p.price ?? 0),
          expiryDate: p.expiry_date,
          stockValue: Number(p.stock ?? 0) * Number(p.price ?? 0),
          status: (p.expiry_date as string) <= today ? "expired" : "expiring",
        }));
        return json({ items, total: items.length });
      },
    },
  },
});
