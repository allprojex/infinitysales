import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";
import { rowToApi } from "../_resource-helpers";
import { canonicalLineDto, groupCanonicalLines, loadCanonicalSaleLines } from "./-canonical-lines";

export const Route = createFileRoute("/api/reports/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        const categoryId = new URL(request.url).searchParams.get("categoryId");
        let q = sb.from("sales").select("*").order("sold_at", { ascending: false });
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const canonical = await loadCanonicalSaleLines((data ?? []).map((sale) => String(sale.id)));
        if (canonical.error) return errorJson(500, canonical.error);
        const linesBySale = groupCanonicalLines(canonical.lines);
        const items = (data ?? [])
          .map((sale) => {
            const saleLines = linesBySale.get(String(sale.id)) ?? [];
            const categories = Array.from(
              new Set(saleLines.map((line) => String(line.category_name ?? "Unknown"))),
            );
            const categoryIds = Array.from(
              new Set(saleLines.map((line) => line.category_id).filter(Boolean)),
            );
            return {
              ...rowToApi(sale),
              items: saleLines.map(canonicalLineDto),
              categories,
              categoryIds,
            } as Record<string, unknown>;
          })
          .filter((sale) => !categoryId || (sale.categoryIds as string[]).includes(categoryId));
        const completed = items.filter((r) => r.status === "completed");
        const totalRevenue = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
        return json({
          items,
          total: items.length,
          totalSales: completed.length,
          totalRevenue,
          scope: scope.scope,
        });
      },
    },
  },
});
