import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

// For each active reorder rule where current stock <= min_level, create a draft PO
// grouped by supplier_id.
export const Route = createFileRoute("/api/reorder-rules/generate-po")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        const { data: rules } = await sb.from("reorder_rules").select("*").eq("user_id", auth.user.id);
        const ruleList = rules ?? [];
        if (!ruleList.length) return json({ generated: 0, pos: [] });

        const productIds = Array.from(new Set(ruleList.map((r: any) => r.product_id).filter(Boolean)));
        const { data: products } = await sb.from("products").select("id,name,sku,stock,cost,supplier_id")
          .eq("user_id", auth.user.id).in("id", productIds as any);
        const pMap = new Map((products ?? []).map((p: any) => [String(p.id), p]));

        const grouped = new Map<string, any[]>();
        for (const r of ruleList as any[]) {
          const p = pMap.get(String(r.product_id)); if (!p) continue;
          const currentStock = Number(p.stock || 0);
          const minLevel = Number(r.min_level ?? r.reorder_point ?? 0);
          if (currentStock > minLevel) continue;
          const reorderQty = Number(r.reorder_qty ?? r.reorder_quantity ?? Math.max(minLevel * 2 - currentStock, 1));
          const supplierKey = String(p.supplier_id ?? r.supplier_id ?? "no-supplier");
          const arr = grouped.get(supplierKey) ?? [];
          arr.push({
            product_id: p.id, name: p.name, sku: p.sku,
            quantity: reorderQty, unit_cost: Number(p.cost || 0),
            total: reorderQty * Number(p.cost || 0),
          });
          grouped.set(supplierKey, arr);
        }

        const created: any[] = [];
        for (const [supplierKey, items] of grouped) {
          const total = items.reduce((s, it) => s + it.total, 0);
          const { data, error } = await sb.from("purchase_orders").insert({
            user_id: auth.user.id,
            supplier_id: supplierKey === "no-supplier" ? null : supplierKey,
            status: "draft",
            items, subtotal: total, total,
            reference: `AUTO-${Date.now()}-${created.length + 1}`,
          }).select("id,reference").single();
          if (!error && data) created.push(data);
        }
        return json({ generated: created.length, pos: created });
      },
    },
  },
});
