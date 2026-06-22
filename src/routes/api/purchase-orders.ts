import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireUser,
  rowToApi,
  safeJson,
  sb,
  loadResourceScope,
} from "./_resource-helpers";
import { notify } from "./_notify";
import { normalizeLocationFields, resolveBranchUuid, resolveWarehouseUuid } from "./-stock-helpers";

type RawItem = Record<string, unknown>;
type PurchaseOrderRow = Record<string, unknown>;
type NormalizedItem = {
  productId: unknown;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
};

const normalizeItems = (items: RawItem[] = []): NormalizedItem[] =>
  items.map((item) => {
    const quantity = Number(item.quantity ?? item.qty ?? 0) || 0;
    const unitCost = Number(item.unitCost ?? item.unit_cost ?? item.price ?? 0) || 0;
    return {
      productId: item.productId ?? item.product_id ?? null,
      productName: item.productName ?? item.product_name ?? item.name ?? "",
      quantity,
      unitCost,
      total: quantity * unitCost,
    };
  });

const toPurchaseOrderApi = (row: PurchaseOrderRow) => ({
  ...rowToApi(row),
  poNumber: row.reference ?? row.id,
  supplierName: row.supplier_name ?? "",
  expectedDate: row.expected_date ?? null,
  receivedDate: row.received_date ?? null,
  items: normalizeItems(Array.isArray(row.items) ? (row.items as RawItem[]) : []),
});

const makeReference = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `PO-${stamp}`;
};

export const Route = createFileRoute("/api/purchase-orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("purchase_orders")
          .select("*", { count: "exact" })
          .order("ordered_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);

        if (search)
          q = q.or(
            `reference.ilike.%${search}%,supplier_name.ilike.%${search}%,notes.ilike.%${search}%`,
          );
        for (const f of ["status", "supplierId", "warehouseId", "branchId"]) {
          const v = params.get(f);
          if (v && v !== "all") {
            const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
            if (f === "warehouseId") {
              const resolved = await resolveWarehouseUuid(user.id, v);
              if (resolved.error) return errorJson(404, resolved.error);
              q = q.eq(col, resolved.warehouseId as never);
            } else if (f === "branchId") {
              const resolved = await resolveBranchUuid(user.id, v);
              if (resolved.error) return errorJson(404, resolved.error);
              q = q.eq(col, resolved.branchId as never);
            } else {
              q = q.eq(col, v);
            }
          }
        }

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map(toPurchaseOrderApi),
          total: count ?? data?.length ?? 0,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const supplierName = String(body?.supplierName ?? body?.supplier_name ?? "").trim();
        if (!supplierName) return errorJson(400, "supplierName is required");
        const normalized = await normalizeLocationFields(user.id, body);
        if (normalized.error) return errorJson(400, normalized.error);

        const items = normalizeItems(Array.isArray(normalized.row.items) ? normalized.row.items : []);
        const subtotal = +items.reduce((sum, item) => sum + Number(item.total ?? 0), 0).toFixed(2);
        const row: Record<string, unknown> = {
          ...apiToRow(normalized.row),
          user_id: user.id,
          reference: normalized.row.reference ?? normalized.row.poNumber ?? makeReference(),
          supplier_name: supplierName,
          items,
          subtotal,
          total: subtotal,
          status: normalized.row.status ?? "draft",
          ordered_at: new Date().toISOString(),
        };

        const { data, error } = await sb
          .from("purchase_orders")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        await notify({
          userId: user.id,
          type: "purchase-order",
          severity: "info",
          title: "Purchase order created",
          message: `PO ${data?.reference ?? data?.id}`,
          link: "/purchases",
          metadata: { id: data?.id, action: "create" },
        });
        return json(toPurchaseOrderApi(data));
      },
    },
  },
});
