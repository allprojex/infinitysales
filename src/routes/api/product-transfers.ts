import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, parseQuery, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";

type JsonRow = Record<string, unknown>;

const GENERAL_STOCK = "General Stock";

const nullable = (value: unknown) => {
  if (value == null || value === "" || value === "__general__") return null;
  return String(value);
};

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

  const { data } = await sb.from("warehouses").select("id,name").in("id", ids as never);
  for (const warehouse of data ?? []) {
    names.set(String(warehouse.id), warehouse.name);
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
        const row = {
          user_id: user.id,
          reference: body.reference ?? body.transferNumber ?? makeReference(),
          from_warehouse_id: nullable(body.fromWarehouseId ?? body.from_warehouse_id),
          to_warehouse_id: nullable(body.toWarehouseId ?? body.to_warehouse_id),
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
