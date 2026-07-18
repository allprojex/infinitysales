import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/supplier-invoices/$id")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = (await safeJson(request)) as Record<string, unknown>;
        const { data: current, error: currentError } = await sb
          .from("supplier_invoices")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (currentError) return errorJson(500, currentError.message);
        if (!current) return errorJson(404, "Invoice not found");

        const update: Record<string, unknown> = {};
        if (body.invoiceNumber !== undefined) update.reference = String(body.invoiceNumber).trim();
        if (body.supplierName !== undefined)
          update.supplier_name = String(body.supplierName).trim();
        if (body.issueDate !== undefined) update.invoiced_at = String(body.issueDate);
        if (body.dueDate !== undefined) update.due_date = String(body.dueDate);
        if (body.subtotal !== undefined) update.subtotal = Number(body.subtotal);
        if (body.taxAmount !== undefined) update.tax = Number(body.taxAmount);
        if (body.total !== undefined) update.total = Number(body.total);
        if (body.notes !== undefined) update.notes = body.notes ? String(body.notes) : null;
        if (body.purchaseOrderId !== undefined)
          update.po_number = body.purchaseOrderId ? String(body.purchaseOrderId).trim() : null;

        if (body.amountPaid !== undefined) {
          const payment = Number(body.amountPaid);
          if (!Number.isFinite(payment) || payment <= 0)
            return errorJson(400, "Payment must be greater than zero");
          const paid = Math.min(Number(current.total ?? 0), Number(current.paid ?? 0) + payment);
          update.paid = paid;
          update.status = paid >= Number(current.total ?? 0) ? "paid" : "partial";
          update.payment_date = body.paymentDate
            ? String(body.paymentDate)
            : new Date().toISOString().slice(0, 10);
          update.payment_method = body.paymentMethod ? String(body.paymentMethod) : null;
          update.payment_reference = body.paymentReference ? String(body.paymentReference) : null;
        }

        const issueDate = String(update.invoiced_at ?? current.invoiced_at ?? "").slice(0, 10);
        const dueDate = String(update.due_date ?? current.due_date ?? "");
        if (issueDate && dueDate && dueDate < issueDate)
          return errorJson(400, "Due date cannot be before the issue date");

        const { data, error } = await sb
          .from("supplier_invoices")
          .update(update as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(data);
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("supplier_invoices")
          .delete()
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("id")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Invoice not found");
        return json({ ok: true });
      },
    },
  },
});
