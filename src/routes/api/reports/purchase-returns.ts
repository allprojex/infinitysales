/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, rowToApi, sb } from "../_resource-helpers";
import { requireReturnPermission } from "../-purchase-return-helpers";

export const Route = createFileRoute("/api/reports/purchase-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireReturnPermission(request, "export");
        if (auth.response) return auth.response;
        const url = new URL(request.url);
        let q = (sb as any)
          .from("purchase_returns")
          .select("*,purchase_return_items(*)")
          .order("returned_at", { ascending: false });
        const from = url.searchParams.get("from"),
          to = url.searchParams.get("to"),
          status = url.searchParams.get("status");
        if (from) q = q.gte("returned_at", from);
        if (to) q = q.lte("returned_at", `${to}T23:59:59.999Z`);
        if (status && status !== "all") q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []).map(rowToApi);
        if (url.searchParams.get("format") === "csv") {
          const header = "Return Number,Date,Status,Settlement,Total,Outstanding,Items\n";
          const csv =
            header +
            rows
              .map((r: any) =>
                [
                  r.returnNumber,
                  r.returnedAt,
                  r.status,
                  r.settlementType,
                  r.totalAmount,
                  r.outstandingAmount,
                  r.purchaseReturnItems?.length ?? 0,
                ]
                  .map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`)
                  .join(","),
              )
              .join("\n");
          return new Response(csv, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": "attachment; filename=purchase-returns.csv",
            },
          });
        }
        return json({ data: rows, total: rows.length });
      },
    },
  },
});
