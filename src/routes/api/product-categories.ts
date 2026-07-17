import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, requireUser, safeJson, sb } from "./_resource-helpers";
import { normalizeCategoryInput } from "./-product-category-helpers";

const categoryTable = () => sb.from("product_categories");

export const Route = createFileRoute("/api/product-categories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const search = url.searchParams.get("search")?.trim();
        const activeOnly = url.searchParams.get("active") === "true";
        let query = categoryTable()
          .select("id,name,description,is_active,created_at,updated_at,products(count)")
          .order("name", { ascending: true });
        if (search) query = query.ilike("name", `%${search}%`);
        if (activeOnly) query = query.eq("is_active", true);
        const { data, error } = await query;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            productCount: Array.isArray(row.products) ? Number(row.products[0]?.count ?? 0) : 0,
          })),
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireAdmin(request);
        if (!user) return response;
        const input = normalizeCategoryInput(await safeJson(request));
        if (!input.name) return errorJson(400, "Category name is required");
        const { data, error } = await categoryTable()
          .insert({ name: input.name, description: input.description, is_active: input.isActive })
          .select("*")
          .single();
        if (error?.code === "23505")
          return errorJson(409, "A category with this name already exists");
        if (error) return errorJson(500, error.message);
        return json(data, { status: 201 });
      },
    },
  },
});
