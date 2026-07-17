/* eslint-disable @typescript-eslint/no-explicit-any */
import { sb } from "./_resource-helpers";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WarehouseRow = {
  id: number;
  uuid_id?: string | null;
  branch_id?: number | null;
  name?: string | null;
};

type BranchRow = {
  id: number;
  uuid_id?: string | null;
  name?: string | null;
};

type StockMovementInput = {
  userId: string;
  productId: string;
  warehouseId?: string | null;
  movementType: string;
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  createdBy?: string | null;
};

export function nullable(value: unknown) {
  if (value == null || value === "" || value === "__general__" || value === "all") return null;
  return String(value);
}

export function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function resolveWarehouse(userId: string, id: unknown) {
  const raw = nullable(id);
  if (!raw) return { warehouse: null as WarehouseRow | null, error: null as string | null };

  let q = (sb as any)
    .from("warehouses")
    .select("id, uuid_id, branch_id, name")
    .eq("user_id", userId);
  q = UUID_RE.test(raw) ? q.eq("uuid_id", raw) : q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  if (error) return { warehouse: null as WarehouseRow | null, error: error.message };
  if (!data) return { warehouse: null as WarehouseRow | null, error: "Warehouse not found" };
  return { warehouse: data as WarehouseRow, error: null as string | null };
}

export async function resolveBranch(userId: string, id: unknown) {
  const raw = nullable(id);
  if (!raw) return { branch: null as BranchRow | null, error: null as string | null };

  let q = (sb as any).from("branches").select("id, uuid_id, name").eq("user_id", userId);
  q = UUID_RE.test(raw) ? q.eq("uuid_id", raw) : q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  if (error) return { branch: null as BranchRow | null, error: error.message };
  if (!data) return { branch: null as BranchRow | null, error: "Branch not found" };
  return { branch: data as BranchRow, error: null as string | null };
}

export function warehouseUuid(warehouse: WarehouseRow | null) {
  return warehouse?.uuid_id ?? (warehouse ? String(warehouse.id) : null);
}

export function branchUuid(branch: BranchRow | null) {
  return branch?.uuid_id ?? (branch ? String(branch.id) : null);
}

export async function resolveWarehouseUuid(userId: string, id: unknown) {
  const resolved = await resolveWarehouse(userId, id);
  return {
    warehouseId: warehouseUuid(resolved.warehouse),
    warehouse: resolved.warehouse,
    error: resolved.error,
  };
}

export async function resolveBranchUuid(userId: string, id: unknown) {
  const resolved = await resolveBranch(userId, id);
  return {
    branchId: branchUuid(resolved.branch),
    branch: resolved.branch,
    error: resolved.error,
  };
}

export async function normalizeLocationFields(userId: string, body: Record<string, any>) {
  const row = { ...body };
  const warehouseRaw = row.warehouseId ?? row.warehouse_id;
  if (warehouseRaw != null && warehouseRaw !== "") {
    const resolved = await resolveWarehouseUuid(userId, warehouseRaw);
    if (resolved.error) return { row, error: resolved.error };
    row.warehouseId = resolved.warehouseId;
    row.warehouse_id = resolved.warehouseId;
  }

  const branchRaw = row.branchId ?? row.branch_id;
  if (branchRaw != null && branchRaw !== "") {
    const resolved = await resolveBranchUuid(userId, branchRaw);
    if (resolved.error) return { row, error: resolved.error };
    row.branchId = resolved.branchId;
    row.branch_id = resolved.branchId;
  }

  return { row, error: null as string | null };
}

export async function productStock(productId: string) {
  const { data, error } = await sb
    .from("products")
    .select("stock, warehouse_id, cost")
    .eq("id", productId as never)
    .maybeSingle();
  if (error)
    return {
      stock: 0,
      warehouseId: null as string | null,
      cost: null as number | null,
      error: error.message,
    };
  if (!data)
    return {
      stock: 0,
      warehouseId: null as string | null,
      cost: null as number | null,
      error: "Product not found",
    };
  return {
    stock: numberOrZero((data as any).stock),
    warehouseId: ((data as any).warehouse_id ?? null) as string | null,
    cost: (data as any).cost == null ? null : numberOrZero((data as any).cost),
    error: null as string | null,
  };
}

export async function adjustProductStock(productId: string, quantityDelta: number) {
  const current = await productStock(productId);
  if (current.error) return current.error;
  const nextStock = Math.max(current.stock + quantityDelta, 0);
  const { error } = await sb
    .from("products")
    .update({ stock: nextStock } as never)
    .eq("id", productId as never);
  return error?.message ?? null;
}

export async function warehouseBalance(
  userId: string,
  productId: string,
  warehouseId: string | null,
) {
  let q = (sb as any)
    .from("stock_movements")
    .select("quantity")
    .eq("user_id", userId)
    .eq("product_id", productId);
  q = warehouseId ? q.eq("warehouse_id", warehouseId) : q.is("warehouse_id", null);
  const { data, error } = await q;
  if (error) return { balance: 0, error: error.message };
  if (data?.length) {
    return {
      balance: data.reduce(
        (sum: number, row: { quantity?: unknown }) => sum + numberOrZero(row.quantity),
        0,
      ),
      error: null as string | null,
    };
  }

  const current = await productStock(productId);
  if (current.error) return { balance: 0, error: current.error };
  if (warehouseId && current.warehouseId === warehouseId)
    return { balance: current.stock, error: null };
  return { balance: 0, error: null as string | null };
}

export async function recordStockMovement(input: StockMovementInput) {
  const quantity = numberOrZero(input.quantity);
  if (!quantity) return { balanceAfter: null as number | null, error: null as string | null };
  const current = await warehouseBalance(input.userId, input.productId, input.warehouseId ?? null);
  if (current.error) return { balanceAfter: null as number | null, error: current.error };
  const balanceAfter = current.balance + quantity;
  const { error } = await (sb as any).from("stock_movements").insert({
    user_id: input.userId,
    product_id: input.productId,
    warehouse_id: input.warehouseId ?? null,
    movement_type: input.movementType,
    quantity,
    unit_cost: input.unitCost ?? null,
    balance_after: balanceAfter,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    reason: input.reason ?? null,
    created_by: input.createdBy ?? input.userId,
  });
  return { balanceAfter, error: error?.message ?? null };
}

export async function warehouseStockRows(
  userId: string,
  warehouseUuidId: string,
  categoryId?: string | null,
) {
  const { data, error } = await (sb as any)
    .from("stock_movements")
    .select("product_id, quantity")
    .eq("user_id", userId)
    .eq("warehouse_id", warehouseUuidId);
  if (error) return { rows: [], error: error.message };

  const balances = new Map<string, number>();
  for (const row of data ?? []) {
    const productId = String(row.product_id);
    balances.set(productId, (balances.get(productId) ?? 0) + numberOrZero(row.quantity));
  }
  const productIds = Array.from(balances.keys());
  if (!productIds.length) return { rows: [], error: null as string | null };

  let productsQuery = sb
    .from("products")
    .select(
      "id,name,sku,price,cost,reorder_level,reorder_point,category_id,product_categories!products_category_id_fkey(name)",
    )
    .in("id", productIds as never)
    .order("name");
  if (categoryId) productsQuery = productsQuery.eq("category_id", categoryId);
  const { data: products, error: productError } = await productsQuery;
  if (productError) return { rows: [], error: productError.message };

  const rows = (products ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stock: balances.get(String(p.id)) ?? 0,
    reorderPoint: p.reorder_point ?? p.reorder_level ?? 0,
    price: p.price,
    cost: p.cost,
    categoryId: p.category_id,
    category: p.product_categories?.name ?? "Other",
  }));
  return { rows, error: null as string | null };
}

export async function warehouseTotals(userId: string) {
  const { data, error } = await (sb as any)
    .from("stock_movements")
    .select("product_id, warehouse_id, quantity")
    .eq("user_id", userId)
    .not("warehouse_id", "is", null);
  if (error)
    return {
      totals: new Map<string, { totalUnits: number; productCount: number }>(),
      error: error.message,
    };

  const balances = new Map<string, number>();
  for (const row of data ?? []) {
    const key = `${row.warehouse_id}:${row.product_id}`;
    balances.set(key, (balances.get(key) ?? 0) + numberOrZero(row.quantity));
  }

  const totals = new Map<string, { totalUnits: number; productCount: number }>();
  for (const [key, stock] of balances.entries()) {
    const [warehouseId] = key.split(":");
    const total = totals.get(warehouseId) ?? { totalUnits: 0, productCount: 0 };
    total.totalUnits += stock;
    if (stock > 0) total.productCount += 1;
    totals.set(warehouseId, total);
  }

  return { totals, error: null as string | null };
}

export async function warehouseInventoryTotals(userId: string) {
  const { data, error } = await (sb as any)
    .from("stock_movements")
    .select("product_id, warehouse_id, quantity")
    .eq("user_id", userId)
    .not("warehouse_id", "is", null);
  if (error) {
    return {
      totals: new Map<
        string,
        { totalUnits: number; productCount: number; retailValue: number; costValue: number }
      >(),
      error: error.message,
    };
  }

  const balances = new Map<string, { warehouseId: string; productId: string; stock: number }>();
  for (const row of data ?? []) {
    const warehouseId = String(row.warehouse_id);
    const productId = String(row.product_id);
    const key = `${warehouseId}:${productId}`;
    const current = balances.get(key) ?? { warehouseId, productId, stock: 0 };
    current.stock += numberOrZero(row.quantity);
    balances.set(key, current);
  }

  const productIds = Array.from(new Set(Array.from(balances.values()).map((row) => row.productId)));
  const prices = new Map<string, { price: number; cost: number }>();
  if (productIds.length) {
    const { data: products, error: productsError } = await sb
      .from("products")
      .select("id,price,cost")
      .in("id", productIds as never);
    if (productsError) {
      return {
        totals: new Map<
          string,
          { totalUnits: number; productCount: number; retailValue: number; costValue: number }
        >(),
        error: productsError.message,
      };
    }
    for (const product of products ?? []) {
      prices.set(String((product as any).id), {
        price: numberOrZero((product as any).price),
        cost: numberOrZero((product as any).cost),
      });
    }
  }

  const totals = new Map<
    string,
    { totalUnits: number; productCount: number; retailValue: number; costValue: number }
  >();
  for (const row of balances.values()) {
    const price = prices.get(row.productId) ?? { price: 0, cost: 0 };
    const total = totals.get(row.warehouseId) ?? {
      totalUnits: 0,
      productCount: 0,
      retailValue: 0,
      costValue: 0,
    };
    total.totalUnits += row.stock;
    if (row.stock > 0) total.productCount += 1;
    total.retailValue += row.stock * price.price;
    total.costValue += row.stock * price.cost;
    totals.set(row.warehouseId, total);
  }

  return { totals, error: null as string | null };
}
