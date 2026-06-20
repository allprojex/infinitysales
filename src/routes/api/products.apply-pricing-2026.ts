import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/products/apply-pricing-2026")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const rows: Array<{ sku?: string; barcode?: string; price?: number }> = Array.isArray(body.rows) ? body.rows : [];

        let updatedCount = 0;
        const unmatchedRows: string[] = [];
        for (const r of rows) {
          if (r.price === undefined) continue;
          const key = r.sku || r.barcode;
          if (!key) continue;
          const column = r.sku ? "sku" : "barcode";
          const { data, error } = await sb.from("products")
            .update({ price: Number(r.price) })
            .eq("user_id", auth.user.id)
            .eq(column, key)
            .select("id");
          if (error || !data || data.length === 0) {
            unmatchedRows.push(String(key));
          } else {
            updatedCount += data.length;
          }
        }
        if (updatedCount > 0) {
          await notify({
            userId: auth.user.id,
            type: "price-change",
            severity: "info",
            title: "Bulk price update applied",
            message: `${updatedCount} product${updatedCount === 1 ? "" : "s"} repriced${unmatchedRows.length ? `, ${unmatchedRows.length} unmatched` : ""}`,
            link: "/products",
            metadata: { updatedCount, unmatchedCount: unmatchedRows.length, action: "bulk-price" },
          });
        }
        return json({
          updatedCount,
          unmatchedCount: unmatchedRows.length,
          unmatchedRows,
          totalRows: rows.length,
        });
      },
    },
  },
});
