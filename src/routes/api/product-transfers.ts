import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, parseQuery, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";
import {
  nullable,
  recordStockMovement,
  resolveWarehouse,
  warehouseBalance,
  warehouseUuid,
} from "./-stock-helpers";

type JsonRow = Record<string, unknown>;

const GENERAL_STOCK = "General Stock";

const makeReference = () => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `TR-${stamp}`;
};

const normalizeItems = (items: unknown): JsonRow[] => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item as JsonRow);
};

const firstItem = (row: JsonRow) => normalizeItems(row.items)[0] ?? {};

const warehouseLabel = (warehouseId: unknown, names: Map<string, string>) => {
  if (warehouseId == null || warehouseId === "") return GENERAL_STOCK;
  return names.get(String(warehouseId)) ?? `Warehouse ${String(warehouseId)}`;
};

const toTransferApi = (row: JsonRow, warehouseNames = new Map<string, string>()) => {
  const item = firstItem(row);
  const productId = item.productId ?? item.product_id ?? null;
  const productName = item.productName ?? item.product_name ?? item.name ?? "Unknown product";
  const quantity = Number(item.quantity ?? item.qty ?? 0) || 0;

  return {
    ...rowToApi(row),
    transferNumber: row.reference ?? row.id,
    productId,
    productName,
    quantity,
    reason: row.reason ?? item.reason ?? null,
    fromWarehouseName: warehouseLabel(row.from_warehouse_id, warehouseNames),
    toWarehouseName: warehouseLabel(row.to_warehouse_id, warehouseNames),
  };
};

async function loadWarehouseNames(rows: JsonRow[]) {
  const ids = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.from_warehouse_id, row.to_warehouse_id])
        .filter((id) => id != null && id !== "")
        .map(String),
    ),
  );
  const names = new Map<string, string>();
  if (!ids.length) return names;

  const warehouseRows: Array<{ id: number; uuid_id?: string | null; name?: string | null }> = [];
  const uuidIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const numericIds = ids.filter((id) => /^\d+$/.test(id));
  if (uuidIds.length) {
    const { data } = await (sb as any).from("warehouses").select("id,uuid_id,name").in("uuid_id", uuidIds);
    warehouseRows.push(...(data ?? []));
  }
  if (numericIds.length) {
    const { data } = await (sb as any).from("warehouses").select("id,uuid_id,name").in("id", numericIds);
    warehouseRows.push(...(data ?? []));
  }
  for (const warehouse of warehouseRows) {
    names.set(String(warehouse.uuid_id ?? warehouse.id), warehouse.name ?? `Warehouse ${warehouse.id}`);
    names.set(String(warehouse.id), warehouse.name ?? `Warehouse ${warehouse.id}`);
  }
  return names;
}

export const Route = createFileRoute("/api/product-transfers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search } = parseQuery(request);
        let q = sb
          .from("product_transfers")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) q = q.or(`reference.ilike.%${search}%,notes.ilike.%${search}%`);

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);

        const rows = (data ?? []) as JsonRow[];
        const warehouseNames = await loadWarehouseNames(rows);
        return json({
          data: rows.map((row) => toTransferApi(row, warehouseNames)),
          total: count ?? rows.length,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const productId = nullable(body.productId ?? body.product_id);
        const quantity = Number(body.quantity ?? body.qty ?? 0);

        if (!productId) return errorJson(400, "productId is required");
        if (!Number.isFinite(quantity) || quantity < 1) return errorJson(400, "quantity must be at least 1");

        const { data: product, error: productError } = await sb
          .from("products")
          .select("id,name,sku")
          .eq("id", productId as never)
          .maybeSingle();
        if (productError) return errorJson(500, productError.message);
        if (!product) return errorJson(404, "Product not found");

        const productName = body.productName ?? body.product_name ?? product.name;
        const reason = body.reason || null;
        const fromWarehouse = await resolveWarehouse(user.id, body.fromWarehouseId ?? body.from_warehouse_id);
        if (fromWarehouse.error) return errorJson(400, fromWarehouse.error);
        const toWarehouse = await resolveWarehouse(user.id, body.toWarehouseId ?? body.to_warehouse_id);
        if (toWarehouse.error) return errorJson(400, toWarehouse.error);
        const fromWarehouseId = warehouseUuid(fromWarehouse.warehouse);
        const toWarehouseId = warehouseUuid(toWarehouse.warehouse);
        if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
          return errorJson(400, "Source and destination warehouses must be different");
        }

        const sourceBalance = await warehouseBalance(user.id, String(productId), fromWarehouseId);
        if (sourceBalance.error) return errorJson(500, sourceBalance.error);
        if (fromWarehouseId && sourceBalance.balance < quantity) {
          return errorJson(400, "Insufficient stock in source warehouse");
        }

        const row = {
          user_id: user.id,
          reference: body.reference ?? body.transferNumber ?? makeReference(),
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          status: body.status ?? "pending",
          notes: body.notes || null,
          transferred_at: body.transferredAt ?? body.transferred_at ?? new Date().toISOString(),
          items: [
            {
              productId,
              product_id: productId,
              productName,
              product_name: productName,
              name: productName,
              sku: product.sku ?? null,
              quantity,
              reason,
            },
          ],
        };

        const { data, error } = await sb
          .from("product_transfers")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);

        const fromMovement = await recordStockMovement({
          userId: user.id,
          productId: String(productId),
          warehouseId: fromWarehouseId,
          movementType: "transfer_out",
          quantity: -quantity,
          referenceType: "product_transfer",
          referenceId: String(data.id),
          reason,
          createdBy: user.id,
        });
        if (fromMovement.error) return errorJson(500, fromMovement.error);

        const toMovement = await recordStockMovement({
          userId: user.id,
          productId: String(productId),
          warehouseId: toWarehouseId,
          movementType: "transfer_in",
          quantity,
          referenceType: "product_transfer",
          referenceId: String(data.id),
          reason,
          createdBy: user.id,
        });
        if (toMovement.error) return errorJson(500, toMovement.error);

        await notify({
          userId: user.id,
          type: "stock-movement",
          severity: "info",
          title: "Stock-movement created",
          message: `Transfer ${data?.reference ?? data?.id}`,
          link: "/product-transfer",
          metadata: { id: data?.id, action: "create" },
        });

        const warehouseNames = await loadWarehouseNames([data as JsonRow]);
        return json(toTransferApi(data as JsonRow, warehouseNames));
      },
    },
  },
});
