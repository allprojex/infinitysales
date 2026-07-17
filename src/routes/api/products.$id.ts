import { createFileRoute } from "@tanstack/react-router";
import {
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
import { normalizeLocationFields } from "./-stock-helpers";

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

export const Route = createFileRoute("/api/products/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("products")
          .select("*,product_categories!products_category_id_fkey(name,is_active)")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(productToApi(data as ProductWithCategory));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (body.categoryId !== undefined) {
          const { data: category, error: categoryError } = await sb
            .from("product_categories")
            .select("id,is_active")
            .eq("id", body.categoryId)
            .maybeSingle();
          if (categoryError) return errorJson(500, categoryError.message);
          if (!category || !category.is_active)
            return errorJson(400, "Select a valid active product category");
        }
        const normalized = await normalizeLocationFields(user.id, body);
        if (normalized.error) return errorJson(400, normalized.error);
        // All authenticated users can edit any product.
        const { data, error } = await sb
          .from("products")
          .update(apiToRow(normalized.row) as never)
          .eq("id", params.id)
          .select("*")
          .maybeSingle();
        const actor = await actorFromUser(user);
        if (error) {
          await recordAudit({
            ...actor,
            action: "product.update",
            entityType: "product",
            entityId: params.id,
            status: "failure",
            details: { error: error.message },
          });
          return errorJson(500, error.message);
        }
        if (!data) return errorJson(404, "Not found");
        await recordAudit({
          ...actor,
          action: "product.update",
          entityType: "product",
          entityId: data.id,
          entityName: data.name,
          status: "success",
          details: { changes: Object.keys(body ?? {}) },
        });
        const changedKeys = Object.keys(body ?? {});
        const priceChanged = changedKeys.includes("price") || changedKeys.includes("cost");
        await notify({
          userId: user.id,
          type: priceChanged ? "price-change" : "product",
          severity: "info",
          title: priceChanged ? "Price updated" : "Product updated",
          message: `${data?.name ?? data?.sku ?? "Product"}${priceChanged && body?.price != null ? ` → ${body.price}` : ""}`,
          link: "/products",
          metadata: { id: data?.id, action: "update", changes: changedKeys },
        });
        const { data: updated } = await sb
          .from("products")
          .select("*,product_categories!products_category_id_fkey(name,is_active)")
          .eq("id", data.id)
          .single();
        return json(productToApi((updated ?? data) as ProductWithCategory));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: existing } = await sb
          .from("products")
          .select("id,name")
          .eq("id", params.id)
          .maybeSingle();
        const { error } = await sb.from("products").delete().eq("id", params.id);
        const actor = await actorFromUser(user);
        if (error) {
          await recordAudit({
            ...actor,
            action: "product.delete",
            entityType: "product",
            entityId: params.id,
            status: "failure",
            details: { error: error.message },
          });
          return errorJson(500, error.message);
        }
        await recordAudit({
          ...actor,
          action: "product.delete",
          entityType: "product",
          entityId: params.id,
          entityName: existing?.name ?? null,
          status: "success",
        });
        await notify({
          userId: user.id,
          type: "product",
          severity: "warning",
          title: "Product deleted",
          message: existing?.name ?? params.id,
          link: "/products",
          metadata: { id: params.id, action: "delete" },
        });
        return json({ ok: true });
      },
    },
  },
});
