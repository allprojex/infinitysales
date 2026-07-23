import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, loadResourceScope, parseQuery, sb } from "./_resource-helpers";
import { canonicalLineDto, loadCanonicalSaleLines } from "./reports/-canonical-lines";
import { customerNameMap, requireSalesReturnPermission } from "./-sale-return-helpers";

/**
 * Step 1 of the return workflow: find a completed, return-eligible sale by
 * invoice number (or its customer's name), then - once one is chosen - list
 * its canonical sale_lines with how much of each line is still returnable.
 */
export const Route = createFileRoute("/api/sales-returns/eligible")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireSalesReturnPermission(request, "create");
        if (auth.response) return auth.response;
        const scope = await loadResourceScope(auth.user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { params } = parseQuery(request);
        const saleId = params.get("saleId");

        if (saleId) {
          let saleQ = (sb as any).from("sales").select("*").eq("id", saleId);
          if (!scope.isPrivileged) saleQ = saleQ.eq("user_id", auth.user.id);
          const { data: sale, error: saleError } = await saleQ.maybeSingle();
          if (saleError) return errorJson(500, saleError.message);
          if (!sale) return errorJson(404, "Sale not found");
          if (sale.status !== "completed" || sale.return_eligible !== true) {
            return errorJson(400, "This sale is not eligible for returns");
          }
          const { lines, error: linesError } = await loadCanonicalSaleLines([saleId]);
          if (linesError) return errorJson(500, linesError);
          const { data: returned, error: returnedError } = await (sb as any)
            .from("sale_return_lines")
            .select("sale_line_id,quantity_returned,sale_returns!inner(status)")
            .eq("sale_returns.sale_id", saleId)
            .eq("sale_returns.status", "completed");
          if (returnedError) return errorJson(500, returnedError.message);
          const returnedByLine = new Map<string, number>();
          for (const row of returned ?? []) {
            const key = String(row.sale_line_id);
            returnedByLine.set(key, (returnedByLine.get(key) ?? 0) + Number(row.quantity_returned));
          }
          const names = await customerNameMap(sale.customer_id ? [String(sale.customer_id)] : []);
          return json({
            sale: {
              id: sale.id,
              reference: sale.reference,
              soldAt: sale.sold_at,
              total: sale.total,
              customerId: sale.customer_id,
              customerName: sale.customer_id
                ? (names.get(String(sale.customer_id)) ?? null)
                : "Walk-in",
            },
            lines: (lines ?? []).map((line) => {
              const dto = canonicalLineDto(line);
              const alreadyReturned = returnedByLine.get(String(dto.id)) ?? 0;
              return {
                ...dto,
                quantityAlreadyReturned: alreadyReturned,
                quantityReturnable: Math.max(Number(dto.quantity ?? 0) - alreadyReturned, 0),
              };
            }),
          });
        }

        const search = (params.get("search") ?? "").trim();
        let q = (sb as any)
          .from("sales")
          .select("id,reference,sold_at,total,customer_id")
          .eq("status", "completed")
          .eq("return_eligible", true)
          .order("sold_at", { ascending: false })
          .limit(20);
        if (!scope.isPrivileged) q = q.eq("user_id", auth.user.id);
        if (search) q = q.ilike("reference", `%${search}%`);
        const { data: sales, error } = await q;
        if (error) return errorJson(500, error.message);
        const names = await customerNameMap(
          (sales ?? []).map((s: any) => String(s.customer_id ?? "")),
        );
        return json({
          data: (sales ?? []).map((s: any) => ({
            id: s.id,
            reference: s.reference,
            soldAt: s.sold_at,
            total: s.total,
            customerId: s.customer_id,
            customerName: s.customer_id ? (names.get(String(s.customer_id)) ?? null) : "Walk-in",
          })),
        });
      },
    },
  },
});
