import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";
import {
  parseSpreadsheet,
  validateSpreadsheetUpload,
  validatePurchaseRow,
  validateSalesRow,
} from "./_import-helpers";
import { createSaleThroughEngine } from "./-sale-engine";
import { deterministicTransactionKey } from "../../lib/logical-idempotency";

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  blocked: string[];
  errors: string[];
  message: string;
}

// /api/import/$type — multi-file bulk import for non-product entities.
// Implemented types: purchases, sales.
export const Route = createFileRoute("/api/import/$type")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const user = auth.user;
        const type = params.type;

        const files: File[] = [];
        try {
          const form = await request.formData();
          for (const v of form.getAll("files")) if (v instanceof File) files.push(v);
        } catch {
          return json({ message: "Invalid upload" }, { status: 400 });
        }

        if (type === "purchases") {
          const res = await importPurchases(files, user.id);
          if (res.imported > 0) {
            await notify({
              userId: user.id,
              type: "supplier-transaction",
              severity: "success",
              title: "Purchase orders imported",
              message: `${res.imported} purchase order(s) imported from ${files.length} file(s)`,
              link: "/purchases",
              metadata: { imported: res.imported, errors: res.errors.length, files: files.length },
            });
          }
          return json(res);
        }

        if (type === "sales") {
          const res = await importSales(files, user.id);
          if (res.imported > 0) {
            await notify({
              userId: user.id,
              type: "sale",
              severity: "success",
              title: "Sales imported",
              message: `${res.imported} sale(s) imported from ${files.length} file(s)`,
              link: "/sales",
              metadata: { imported: res.imported, errors: res.errors.length, files: files.length },
            });
          }
          return json(res);
        }

        return json({
          imported: 0,
          updated: 0,
          skipped: files.length,
          blocked: [],
          errors: [
            `Bulk import for "${type}" is not yet implemented. ${files.length} file(s) received.`,
          ],
          message: `Received ${files.length} file(s) for ${type}.`,
        });
      },
    },
  },
});

async function readFile(file: File, result: ImportResult) {
  const validation = validateSpreadsheetUpload(file);
  if (!validation.ok) {
    result.errors.push(`${file.name}: ${validation.message}`);
    result.skipped += 1;
    return null;
  }
  try {
    return await parseSpreadsheet(file);
  } catch (e: any) {
    result.errors.push(`${file.name}: failed to read file — ${e?.message ?? "unknown"}`);
    return null;
  }
}

async function importPurchases(files: File[], userId: string): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    blocked: [],
    errors: [],
    message: "",
  };
  if (!files.length) {
    result.errors.push("No files provided.");
    result.message =
      "Upload at least one CSV or XLSX file with columns: order_ref, supplier, product_name, sku, quantity, unit_cost, expected_date, notes.";
    return result;
  }

  const { data: existingSuppliers } = await sb
    .from("suppliers")
    .select("name")
    .eq("user_id", userId);
  const supplierByName = new Set<string>();
  for (const s of existingSuppliers ?? []) if (s.name) supplierByName.add(s.name.toLowerCase());

  for (const file of files) {
    const parsed = await readFile(file, result);
    if (!parsed) continue;
    const { rows, fileWarnings } = parsed;
    for (const w of fileWarnings) result.errors.push(`${file.name}: ${w}`);
    if (!rows.length) {
      result.errors.push(`${file.name}: no data rows.`);
      continue;
    }

    // Validate and group by order_ref.
    const byRef = new Map<string, ReturnType<typeof validatePurchaseRow>["data"][]>();
    rows.forEach((raw, idx) => {
      const res = validatePurchaseRow(raw, idx + 2);
      if (res.errors.length) {
        result.errors.push(`${file.name}: ${res.errors.join("; ")}`);
        result.skipped += 1;
        return;
      }
      if (!res.data) return;
      const arr = byRef.get(res.data.orderRef) ?? [];
      arr.push(res.data);
      byRef.set(res.data.orderRef, arr);
    });

    for (const [ref, group] of byRef) {
      try {
        const first = group[0]!;
        const supplierName = first.supplierName;
        const supplierKey = supplierName?.toLowerCase() ?? "";
        if (supplierName && !supplierByName.has(supplierKey)) {
          const { data: created } = await sb
            .from("suppliers")
            .insert({ user_id: userId, name: supplierName, is_active: true } as any)
            .select("id")
            .single();
          if (created) supplierByName.add(supplierKey);
        }

        const items = group.map((it) => ({
          product_name: it!.productName,
          sku: it!.sku,
          quantity: it!.quantity,
          unit_cost: it!.unitCost,
          line_total: it!.lineTotal,
        }));
        const subtotal = +items.reduce((s, it) => s + it.line_total, 0).toFixed(2);

        const { error } = await sb.from("purchase_orders").insert({
          user_id: userId,
          reference: ref,
          supplier_id: null,
          supplier_name: supplierName,
          status: first.status === "ordered" ? "ordered" : "pending",
          subtotal,
          tax: 0,
          discount: 0,
          total: subtotal,
          items,
          notes: first.notes,
          expected_date: first.expectedDate,
          ordered_at: new Date().toISOString(),
        } as any);

        if (error) result.errors.push(`${file.name} / ${ref}: ${error.message}`);
        else result.imported += 1;
      } catch (e: any) {
        result.errors.push(`${file.name} / ${ref}: ${e?.message ?? "unknown error"}`);
      }
    }
  }

  result.message = result.imported
    ? `Imported ${result.imported} purchase order(s) from ${files.length} file(s).`
    : `No purchase orders imported.`;
  return result;
}

async function importSales(files: File[], userId: string): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    blocked: [],
    errors: [],
    message: "",
  };
  if (!files.length) {
    result.errors.push("No files provided.");
    result.message =
      "Upload at least one CSV or XLSX file with columns: order_ref, customer_name, customer_email, product_name, quantity, unit_price, tax, status, date, notes.";
    return result;
  }

  // Pre-load product catalog for price lookup (by name, case-insensitive).
  const { data: catalog } = await sb.from("products").select("id,name,price").eq("user_id", userId);
  const productByName = new Map<string, { id: string; price: number }>();
  for (const p of catalog ?? [])
    if (p.name)
      productByName.set(p.name.toLowerCase(), { id: String(p.id), price: Number(p.price ?? 0) });

  const { data: customers } = await (sb as any)
    .from("customers")
    .select("id,uuid_id,name,email")
    .eq("user_id", userId);
  const customerByEmail = new Map<string, string>();
  const customerByName = new Map<string, string>();
  for (const customer of customers ?? []) {
    const customerId = customer.uuid_id ? String(customer.uuid_id) : null;
    if (!customerId) continue;
    if (customer.email) customerByEmail.set(String(customer.email).toLowerCase(), customerId);
    if (customer.name) customerByName.set(String(customer.name).toLowerCase(), customerId);
  }

  for (const file of files) {
    const parsed = await readFile(file, result);
    if (!parsed) continue;
    const { rows, fileWarnings } = parsed;
    for (const w of fileWarnings) result.errors.push(`${file.name}: ${w}`);
    if (!rows.length) {
      result.errors.push(`${file.name}: no data rows.`);
      continue;
    }

    // Group rows by order_ref (fallback: each row is its own sale).
    const groups = new Map<string, ReturnType<typeof validateSalesRow>["data"][]>();
    rows.forEach((raw, idx) => {
      const res = validateSalesRow(raw, idx + 2);
      if (res.errors.length) {
        result.errors.push(`${file.name}: ${res.errors.join("; ")}`);
        result.skipped += 1;
        return;
      }
      if (!res.data) return;
      const key = res.data.orderRef || `__row_${idx + 2}`;
      const arr = groups.get(key) ?? [];
      arr.push(res.data);
      groups.set(key, arr);
    });

    for (const [ref, group] of groups) {
      try {
        const first = group[0]!;
        const items = group.map((it) => {
          const found = productByName.get(it!.productName.toLowerCase());
          const unitPrice = it!.unitPrice ?? found?.price ?? 0;
          return {
            product_id: found?.id ?? null,
            product_name: it!.productName,
            quantity: it!.quantity,
            unit_price: unitPrice,
            line_total: +(it!.quantity * unitPrice).toFixed(2),
          };
        });
        const subtotal = +items.reduce((s, it) => s + it.line_total, 0).toFixed(2);
        const tax = first.tax || 0;
        const total = +(subtotal + tax).toFixed(2);
        const customerId = first.customerEmail
          ? (customerByEmail.get(first.customerEmail.toLowerCase()) ?? null)
          : first.customerName
            ? (customerByName.get(first.customerName.toLowerCase()) ?? null)
            : null;

        const saleRequest = {
          reference: ref.startsWith("__row_") ? null : ref,
          customerId,
          status: first.status,
          subtotal,
          tax,
          total,
          items: items.map((item) => ({
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
          })),
          notes: first.notes,
          soldAt: first.date
            ? new Date(first.date).toISOString()
            : new Date(file.lastModified || 0).toISOString(),
        };
        const idempotencyKey = await deterministicTransactionKey(
          `sales-import:${userId}:${file.name}:${ref}`,
          saleRequest,
        );
        const created = await createSaleThroughEngine(
          userId,
          {
            ...saleRequest,
            idempotencyKey,
          },
          {
            applyPromotions: false,
            sourceSystem: "historical_import",
            effectsMode: "historical_no_post",
            snapshotCompleteness: "catalog_at_import",
            pricingSource: "historical_import",
          },
        );

        if (created.error) result.errors.push(`${file.name} / ${ref}: ${created.error}`);
        else result.imported += 1;
      } catch (e: any) {
        result.errors.push(`${file.name} / ${ref}: ${e?.message ?? "unknown error"}`);
      }
    }
  }

  result.message = result.imported
    ? `Imported ${result.imported} sale(s) from ${files.length} file(s).`
    : `No sales imported.`;
  return result;
}
