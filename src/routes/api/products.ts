import { createFileRoute } from "@tanstack/react-router";
import { parseQuery, requireUser, rowToApi, errorJson, json, sb, safeJson, apiToRow } from "./_resource-helpers";
import { recordAudit, actorFromUser } from "./_audit";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        const lowStock = params.get("lowStock");
        // All authenticated users can view the full product catalog.
        let q = sb.from("products").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
        if (lowStock === "true") q = q.lte("stock", 5 as any);
        for (const f of ["category", "warehouseId", "branchId", "isActive"]) {
          const v = params.get(f);
          if (v != null && v !== "") {
            const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
            q = q.eq(col, v);
          }
        }
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        // All authenticated users can create products. user_id records the creator.
        const row: any = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb.from("products").insert(row).select("*").single();
        const actor = await actorFromUser(user as any);
        if (error) {
          await recordAudit({
            ...actor,
            action: "product.create",
            entityType: "product",
            entityName: body?.name ?? null,
            status: "failure",
            details: { error: error.message },
          });
          return errorJson(500, error.message);
        }
        await recordAudit({
          ...actor,
          action: "product.create",
          entityType: "product",
          entityId: data.id,
          entityName: data.name,
          status: "success",
        });
        await notify({
          userId: user.id,
          type: "product",
          severity: "success",
          title: "Product created",
          message: data?.name ?? data?.sku ?? "New product",
          link: "/products",
          metadata: { id: data?.id, action: "create" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
