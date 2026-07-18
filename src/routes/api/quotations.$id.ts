/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";

const select = "*,customers!quotations_customer_uuid_fk(name,uuid_id)";
const toApi = (row: Record<string, any>) => {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    quoteNumber: row.reference,
    customerId: row.customer_id,
    customerName: customer?.name ?? "Unknown customer",
    status: row.status ?? "draft",
    subtotal: Number(row.subtotal ?? 0),
    tax: Number(row.tax ?? 0),
    discount: Number(row.discount ?? 0),
    total: Number(row.total ?? 0),
    items: Array.isArray(row.items) ? row.items : [],
    notes: row.notes,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const Route = createFileRoute("/api/quotations/$id")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body.customerId) return errorJson(400, "customerId is required");
        const items = Array.isArray(body.items)
          ? body.items.filter((item: any) => item.productId && Number(item.quantity) > 0)
          : [];
        if (!items.length) return errorJson(400, "Add at least one product");
        const subtotal = items.reduce(
          (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unitPrice),
          0,
        );
        const tax = Number(body.tax ?? 0),
          discount = Number(body.discount ?? 0);
        const { data, error } = await sb
          .from("quotations")
          .update({
            customer_id: body.customerId,
            status: body.status ?? "draft",
            subtotal,
            tax,
            discount,
            total: subtotal + tax - discount,
            items,
            notes: body.notes || null,
            valid_until: body.validUntil || null,
          })
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select(select)
          .single();
        if (error) return errorJson(500, error.message);
        return json(toApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("quotations")
          .delete()
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("id")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json({ success: true });
      },
    },
  },
});
