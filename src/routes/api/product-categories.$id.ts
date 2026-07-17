import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, safeJson, sb } from "./_resource-helpers";
import { normalizeCategoryInput } from "./-product-category-helpers";
import { categoryDeletionError } from "./-product-category-helpers";

const categoryTable = () => sb.from("product_categories");

export const Route = createFileRoute("/api/product-categories/$id")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { user, response } = await requireAdmin(request);
        if (!user) return response;
        const body = await safeJson(request);
        const input = normalizeCategoryInput(body);
        const update: { name?: string; description?: string | null; is_active?: boolean } = {};
        if (body.name !== undefined) {
          if (!input.name) return errorJson(400, "Category name is required");
          update.name = input.name;
        }
        if (body.description !== undefined) update.description = input.description;
        if (body.isActive !== undefined) update.is_active = input.isActive;
        const { data, error } = await categoryTable()
          .update(update)
          .eq("id", params.id)
          .select("*")
          .maybeSingle();
        if (error?.code === "23505")
          return errorJson(409, "A category with this name already exists");
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Category not found");
        return json(data);
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireAdmin(request);
        if (!user) return response;
        const { count, error: countError } = await sb
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("category_id", params.id);
        if (countError) return errorJson(500, countError.message);
        const deletionError = categoryDeletionError(count ?? 0);
        if (deletionError) return errorJson(409, deletionError);
        const { error } = await categoryTable().delete().eq("id", params.id);
        if (error) return errorJson(500, error.message);
        return json({ success: true });
      },
    },
  },
});
