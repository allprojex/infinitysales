import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, parseQuery, requireUser, safeJson, sb } from "./_resource-helpers";

type InvoiceRow = Record<string, unknown>;

const toInvoice = (row: InvoiceRow) => ({
  id: row.id,
  purchase_order_id: row.purchase_order_id,
  invoice_number: row.reference ?? "",
  supplier_name: row.supplier_name ?? "",
  supplier_id: row.supplier_id,
  supplier_display_name: row.supplier_name ?? "",
  issue_date: row.invoiced_at ? String(row.invoiced_at).slice(0, 10) : "",
  due_date: row.due_date,
  subtotal: row.subtotal ?? 0,
  tax_amount: row.tax ?? 0,
  total: row.total ?? 0,
  status: row.status ?? "unpaid",
  amount_paid: row.paid ?? 0,
  payment_date: row.payment_date,
  payment_method: row.payment_method,
  payment_reference: row.payment_reference,
  notes: row.notes,
  po_number: row.po_number,
  created_at: row.created_at,
});

const invoiceInput = (body: Record<string, unknown>) => ({
  reference: String(body.invoiceNumber ?? "").trim(),
  supplier_name: String(body.supplierName ?? "").trim(),
  invoiced_at: body.issueDate ? String(body.issueDate) : null,
  due_date: body.dueDate ? String(body.dueDate) : null,
  subtotal: Number(body.subtotal ?? 0),
  tax: Number(body.taxAmount ?? 0),
  total: Number(body.total ?? 0),
  notes: body.notes ? String(body.notes) : null,
  po_number: body.purchaseOrderId ? String(body.purchaseOrderId).trim() : null,
});

const validateInvoice = (row: ReturnType<typeof invoiceInput>) => {
  if (!row.reference) return "Invoice number is required";
  if (!row.supplier_name) return "Supplier name is required";
  if (!row.invoiced_at) return "Issue date is required";
  if (!row.due_date) return "Due date is required";
  if (row.due_date < row.invoiced_at) return "Due date cannot be before the issue date";
  if (!Number.isFinite(row.total) || row.total <= 0) return "Total must be greater than zero";
  return null;
};

export const Route = createFileRoute("/api/supplier-invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, params } = parseQuery(request);
        let query = sb
          .from("supplier_invoices")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("invoiced_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = params.get("status");
        if (status === "overdue") {
          query = query.neq("status", "paid").lt("due_date", new Date().toISOString().slice(0, 10));
        } else if (status) {
          query = query.eq("status", status);
        }
        const { data, error, count } = await query;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map((row) => toInvoice(row)),
          total: count ?? 0,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = (await safeJson(request)) as Record<string, unknown>;
        const row = invoiceInput(body);
        const validation = validateInvoice(row);
        if (validation) return errorJson(400, validation);
        const { data, error } = await sb
          .from("supplier_invoices")
          .insert({ ...row, user_id: user.id, status: "unpaid", paid: 0 })
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(toInvoice(data), { status: 201 });
      },
    },
  },
});
