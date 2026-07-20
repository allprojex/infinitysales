import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, parseQuery, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";
import { requirePermission } from "./-permission-helpers";
import {
  nullable,
  recordStockMovement,
  resolveWarehouse,
  resolveCentralWarehouse,
  sourceWarehouseBalance,
  warehouseUuid,
} from "./-stock-helpers";

type JsonRow = Record<string, unknown>;
type NormalizedTransferItem = {
  productId: string | null;
  quantity: number;
  requestedName: string | null;
};

// Historical rows created before the central-warehouse model may still have
// a null from/to warehouse ("General Stock"). New rows never do — a null
// selection resolves to the central warehouse's real id in POST below.
const warehouseLabel = (
  warehouseId: unknown,
  names: Map<string, string>,
  central: { name: string | null } | null,
) => {
  if (warehouseId == null || warehouseId === "") {
    return central ? `${central.name} (General Stock)` : "General Stock";
  }
  return names.get(String(warehouseId)) ?? `Warehouse ${String(warehouseId)}`;
};

const makeReference = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `TR-${stamp}`;
};

const normalizeItems = (items: unknown): JsonRow[] => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item as JsonRow);
};

const firstItem = (row: JsonRow) => normalizeItems(row.items)[0] ?? {};

const toTransferApi = (
  row: JsonRow,
  warehouseNames = new Map<string, string>(),
  central: { name: string | null } | null = null,
) => {
  const items = normalizeItems(row.items);
  const item = items[0] ?? {};
  const productId = item.productId ?? item.product_id ?? null;
  const productName = item.productName ?? item.product_name ?? item.name ?? "Unknown product";
  const quantity = items.reduce(
    (sum, current) => sum + (Number(current.quantity ?? current.qty ?? 0) || 0),
    0,
  );
  const itemNames = items.map((current) =>
    String(current.productName ?? current.product_name ?? current.name ?? "Unknown product"),
  );

  return {
    ...rowToApi(row),
    transferNumber: row.reference ?? row.id,
    productId,
    productName:
      items.length > 1
        ? `${items.length} products: ${itemNames.slice(0, 3).join(", ")}${items.length > 3 ? "…" : ""}`
        : productName,
    itemCount: items.length,
    quantity,
    reason: row.reason ?? item.reason ?? null,
    fromWarehouseName: warehouseLabel(row.from_warehouse_id, warehouseNames, central),
    toWarehouseName: warehouseLabel(row.to_warehouse_id, warehouseNames, central),
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
    const { data } = await sb
      .from("warehouses")
      .select("id,uuid_id,name")
      .in("uuid_id", uuidIds as never);
    warehouseRows.push(...(data ?? []));
  }
  if (numericIds.length) {
    const { data } = await sb
      .from("warehouses")
      .select("id,uuid_id,name")
      .in("id", numericIds as never);
    warehouseRows.push(...(data ?? []));
  }
  for (const warehouse of warehouseRows) {
    names.set(
      String(warehouse.uuid_id ?? warehouse.id),
      warehouse.name ?? `Warehouse ${warehouse.id}`,
    );
    names.set(String(warehouse.id), warehouse.name ?? `Warehouse ${warehouse.id}`);
  }
  return names;
}

export const Route = createFileRoute("/api/product-transfers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requirePermission(
          request,
          "perm_user_product_transfers",
          false,
        );
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
        const [warehouseNames, central] = await Promise.all([
          loadWarehouseNames(rows),
          resolveCentralWarehouse(user.id),
        ]);
        return json({
          data: rows.map((row) => toTransferApi(row, warehouseNames, central.warehouse)),
          total: count ?? rows.length,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requirePermission(
          request,
          "perm_user_product_transfers",
          false,
        );
        if (!user) return response;
        const body = (await safeJson(request)) as JsonRow;
        const requestedItems: JsonRow[] = Array.isArray(body.items)
          ? body.items.map((item) => item as JsonRow)
          : [
              {
                productId: body.productId ?? body.product_id,
                quantity: body.quantity ?? body.qty,
                productName: body.productName ?? body.product_name,
              },
            ];
        const normalizedItems: NormalizedTransferItem[] = requestedItems.map((raw) => ({
          productId: nullable(raw.productId ?? raw.product_id),
          quantity: Number(raw.quantity ?? raw.qty ?? 0),
          requestedName:
            (raw.productName ?? raw.product_name)
              ? String(raw.productName ?? raw.product_name)
              : null,
        }));
        if (!normalizedItems.length || normalizedItems.some((item) => !item.productId))
          return errorJson(400, "At least one product is required");
        if (normalizedItems.some((item) => !Number.isFinite(item.quantity) || item.quantity < 1))
          return errorJson(400, "Every quantity must be at least 1");
        const productIds = normalizedItems.map((item) => String(item.productId));
        if (new Set(productIds).size !== productIds.length)
          return errorJson(400, "A product can only be selected once per transfer");

        const { data: products, error: productError } = await sb
          .from("products")
          .select("id,name,sku,stock")
          .in("id", productIds as never);
        if (productError) return errorJson(500, productError.message);
        if ((products ?? []).length !== productIds.length)
          return errorJson(404, "One or more selected products were not found");
        const productsById = new Map(
          (products ?? []).map((product) => [String(product.id), product]),
        );

        const reason = body.reason ? String(body.reason) : null;

        // "General Stock" is no longer a separate location — it IS the
        // central warehouse (warehouses.is_default = true). Every transfer
        // must resolve to a real warehouse on both sides; a null/empty
        // selection falls back to the central warehouse instead of writing
        // warehouse_id: null.
        const central = await resolveCentralWarehouse(user.id);
        if (central.error || !central.warehouse) return errorJson(400, central.error);
        const centralUuid = warehouseUuid(central.warehouse)!;

        const fromWarehouse = await resolveWarehouse(
          user.id,
          body.fromWarehouseId ?? body.from_warehouse_id,
        );
        if (fromWarehouse.error) return errorJson(400, fromWarehouse.error);
        const toWarehouse = await resolveWarehouse(
          user.id,
          body.toWarehouseId ?? body.to_warehouse_id,
        );
        if (toWarehouse.error) return errorJson(400, toWarehouse.error);
        const fromWarehouseId = warehouseUuid(fromWarehouse.warehouse) ?? centralUuid;
        const toWarehouseId = warehouseUuid(toWarehouse.warehouse) ?? centralUuid;
        if (fromWarehouseId === toWarehouseId) {
          return errorJson(400, "Source and destination warehouses must be different");
        }

        for (const item of normalizedItems) {
          const product = productsById.get(String(item.productId));
          const sourceBalance = await sourceWarehouseBalance(
            user.id,
            String(item.productId),
            fromWarehouseId,
            centralUuid,
          );
          if (sourceBalance.error) return errorJson(500, sourceBalance.error);
          if (sourceBalance.balance < item.quantity) {
            return errorJson(
              400,
              `Insufficient stock for ${product?.name ?? "selected product"}. Available: ${sourceBalance.balance}`,
            );
          }
        }

        const transferItems = normalizedItems.map((item) => {
          const product = productsById.get(String(item.productId))!;
          const productName = item.requestedName ?? product.name;
          return {
            productId: item.productId,
            product_id: item.productId,
            productName,
            product_name: productName,
            name: productName,
            sku: product.sku ?? null,
            quantity: item.quantity,
            reason,
          };
        });

        const row = {
          user_id: user.id,
          reference: body.reference ?? body.transferNumber ?? makeReference(),
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          status: body.status ?? "pending",
          notes: body.notes || null,
          transferred_at: body.transferredAt ?? body.transferred_at ?? new Date().toISOString(),
          items: transferItems,
        };

        const { data, error } = await sb
          .from("product_transfers")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);

        for (const item of normalizedItems) {
          const productId = String(item.productId);
          const fromMovement = await recordStockMovement({
            userId: user.id,
            productId,
            warehouseId: fromWarehouseId,
            movementType: "transfer_out",
            quantity: -item.quantity,
            referenceType: "product_transfer",
            referenceId: String(data.id),
            reason,
            createdBy: user.id,
          });
          if (fromMovement.error) return errorJson(500, fromMovement.error);
          const toMovement = await recordStockMovement({
            userId: user.id,
            productId,
            warehouseId: toWarehouseId,
            movementType: "transfer_in",
            quantity: item.quantity,
            referenceType: "product_transfer",
            referenceId: String(data.id),
            reason,
            createdBy: user.id,
          });
          if (toMovement.error) return errorJson(500, toMovement.error);
          // Product Transfer never touches products.stock — it only ever
          // reallocates stock between real warehouses (the central one
          // included). products.stock is the company-wide total, changed
          // only by sales and purchase receiving.
        }

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
        return json(toTransferApi(data as JsonRow, warehouseNames, central.warehouse));
      },
    },
  },
});
