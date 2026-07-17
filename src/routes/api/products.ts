import { createFileRoute } from "@tanstack/react-router";
import {
  parseQuery,
  requireUser,
  rowToApi,
  errorJson,
  json,
  sb,
  safeJson,
  apiToRow,
} from "./_resource-helpers";
import { recordAudit, actorFromUser } from "./_audit";
import { notify } from "./_notify";
import { normalizeLocationFields, resolveBranchUuid, resolveWarehouseUuid } from "./-stock-helpers";

type ProductWithCategory = Record<string, unknown> & {
  product_categories?: { name?: string | null; is_active?: boolean | null } | null;
};
const productToApi = (row: ProductWithCategory) => {
  const { product_categories: category, ...product } = row;
  return {
    ...rowToApi(product),
    category: category?.name ?? "Other",
    categoryIsActive: category?.is_active ?? true,
  };
};

export const Route = createFileRoute("/api/products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        const lowStock = params.get("lowStock");
        // All authenticated users can view the full product catalog.
        let q = sb
          .from("products")
          .select("*,product_categories!products_category_id_fkey(name,is_active)", {
            count: "exact",
          })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search)
          q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
        if (lowStock === "true") q = q.lte("stock", 5);
        for (const f of ["categoryId", "isActive"]) {
          const v = params.get(f);
          if (v != null && v !== "") {
            const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
            q = q.eq(col, v);
          }
        }
        const warehouseId = params.get("warehouseId");
        if (warehouseId) {
          const resolved = await resolveWarehouseUuid(user.id, warehouseId);
          if (resolved.error) return errorJson(404, resolved.error);
          q = q.eq("warehouse_id", resolved.warehouseId as never);
        }
        const branchId = params.get("branchId");
        if (branchId) {
          const resolved = await resolveBranchUuid(user.id, branchId);
          if (resolved.error) return errorJson(404, resolved.error);
          q = q.eq("branch_id", resolved.branchId as never);
        }
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map((row) => productToApi(row as ProductWithCategory)),
          total: count ?? 0,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        if (!body?.categoryId) return errorJson(400, "categoryId is required");
        const { data: category, error: categoryError } = await sb
          .from("product_categories")
          .select("id,is_active")
          .eq("id", body.categoryId)
          .maybeSingle();
        if (categoryError) return errorJson(500, categoryError.message);
        if (!category || !category.is_active)
          return errorJson(400, "Select a valid active product category");
        const normalized = await normalizeLocationFields(user.id, body);
        if (normalized.error) return errorJson(400, normalized.error);
        // All authenticated users can create products. user_id records the creator.
        const productRow = apiToRow(normalized.row);
        delete productRow.category;
        const row = { ...productRow, user_id: user.id };
        const { data, error } = await sb
          .from("products")
          .insert(row as never)
          .select("*")
          .single();
        const actor = await actorFromUser(user);
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
        const { data: created } = await sb
          .from("products")
          .select("*,product_categories!products_category_id_fkey(name,is_active)")
          .eq("id", data.id)
          .single();
        return json(productToApi((created ?? data) as ProductWithCategory));
      },
    },
  },
});
