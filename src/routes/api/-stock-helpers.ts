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

// Warehouses and branches are a shared business directory, like products
// and customers (see the "shared" comments in products.ts/customers.ts) --
// userId is kept in these signatures only because callers already pass it
// (mostly for attribution elsewhere), not to scope these lookups. Confirmed
// live: a cashier account had zero warehouses of its own, so every one of
// these functions failed for any account other than whichever one created
// the warehouses/branches in the first place.
export async function resolveWarehouse(userId: string, id: unknown) {
  const raw = nullable(id);
  if (!raw) return { warehouse: null as WarehouseRow | null, error: null as string | null };

  let q = (sb as any).from("warehouses").select("id, uuid_id, branch_id, name");
  q = UUID_RE.test(raw) ? q.eq("uuid_id", raw) : q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  if (error) return { warehouse: null as WarehouseRow | null, error: error.message };
  if (!data) return { warehouse: null as WarehouseRow | null, error: "Warehouse not found" };
  return { warehouse: data as WarehouseRow, error: null as string | null };
}

export async function resolveBranch(userId: string, id: unknown) {
  const raw = nullable(id);
  if (!raw) return { branch: null as BranchRow | null, error: null as string | null };

  let q = (sb as any).from("branches").select("id, uuid_id, name");
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
  // The stock ledger spans every staff member's recorded movements, not just
  // the calling account's own -- a balance must include what everyone else
  // posted, or it silently undercounts the moment more than one account is
  // in use.
  let q = (sb as any).from("stock_movements").select("quantity").eq("product_id", productId);
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

// --- Central warehouse ("Champion Mart") model ---------------------------
//
// The account's central/receiving/distribution warehouse is the *same pool*
// that used to be modeled as a separate "General Stock" (warehouse_id: null)
// location. There is exactly one central warehouse per account: the one
// with warehouses.is_default = true (already-existing flag; previously only
// a UI star badge with a uniqueness guard in warehouses.ts/warehouses.$id.ts,
// now given real functional meaning).
//
// Its balance is never read from its own ledger rows. It is DERIVED:
//   centralBalance(product) = products.stock - sum(every OTHER warehouse's
//   ledger balance for that product)
// This makes "every unit belongs to exactly one real warehouse" hold by
// construction (products.stock = central + sum(branches), always), and it
// automatically absorbs historical warehouse_id = null rows for free —
// those only ever affected products.stock's own history (via the now-removed
// Product Transfer adjustProductStock calls), never a *branch* warehouse's
// ledger, so subtracting branch balances from the current products.stock
// already gives the right answer without needing to special-case null rows.
//
// Branch warehouses are unchanged: a plain sum of their own stock_movements
// rows (warehouseBalance() / warehouseStockRows() above).
//
// --- Compatibility layer, not a permanent design ---
// The DERIVED formula exists only because Champion Mart's ledger doesn't yet
// hold an opening balance for existing production data (it has zero
// stock_movements rows for most products today). Once that backfill is done
// (one "opening_balance" stock_movements row per product, equal to its
// derived balance at cutover — the exact correction this audit's
// reconciliation report proposes), Champion Mart becomes a warehouse like
// any other and CENTRAL_WAREHOUSE_LEDGER_BACKED below flips to true.
//
// Every caller (product-transfers.ts, warehouses.$id.stock.ts,
// warehouse-report.ts, sales/purchase flows) only ever calls the four public
// functions below (resolveCentralWarehouse, centralWarehouseBalance,
// sourceWarehouseBalance, warehouseStockRowsFor, warehouseInventoryTotalsFor)
// — none of them need to change when the flag flips, since the derived vs.
// ledger-sum choice is fully contained inside this module.
//
// DO NOT set this to true until:
//   1. Every product's opening balance has been backfilled into Champion
//      Mart's own stock_movements ledger (one "opening_balance" row per
//      product, equal to its derived centralWarehouseBalance() at the
//      moment of cutover), and
//   2. That backfill has been reconciled — sum(all warehouses) ==
//      products.stock for every product, verified by query, not assumed.
// Flipping this without the backfill silently zeroes out Champion Mart's
// reported stock for every product that has no ledger rows yet (which, as
// of this writing, is virtually all of them).
//
// This is a plain, non-exported module-level TypeScript constant — it is
// NOT read from an environment variable, a database row, a feature-flag
// service, or any request/user input. The only way to change it is to edit
// this file and ship a new deploy; there is no runtime or admin-configurable
// path to flip it, accidentally or otherwise.
const CENTRAL_WAREHOUSE_LEDGER_BACKED = false;

export type CentralWarehouseRow = { id: number; uuid_id: string | null; name: string | null };

export async function resolveCentralWarehouse(userId: string) {
  const { data, error } = await (sb as any)
    .from("warehouses")
    .select("id, uuid_id, name")
    .eq("is_default", true)
    .maybeSingle();
  if (error) return { warehouse: null as CentralWarehouseRow | null, error: error.message };
  if (!data)
    return {
      warehouse: null as CentralWarehouseRow | null,
      error:
        "No central warehouse is configured for this account (no warehouse is marked as default).",
    };
  return { warehouse: data as CentralWarehouseRow, error: null as string | null };
}

// Sum of a single product's ledger balance across every warehouse EXCEPT the
// central one. One query regardless of how many branch warehouses exist.
async function nonCentralLedgerTotal(
  userId: string,
  productId: string,
  centralWarehouseUuid: string,
) {
  const { data, error } = await (sb as any)
    .from("stock_movements")
    .select("quantity")
    .eq("product_id", productId)
    .not("warehouse_id", "is", null)
    .neq("warehouse_id", centralWarehouseUuid);
  if (error) return { total: 0, error: error.message };
  return {
    total: (data ?? []).reduce(
      (sum: number, row: { quantity?: unknown }) => sum + numberOrZero(row.quantity),
      0,
    ),
    error: null as string | null,
  };
}

export async function centralWarehouseBalance(
  userId: string,
  productId: string,
  centralWarehouseUuid: string,
) {
  // Post-backfill: Champion Mart is a warehouse like any other — plain
  // ledger sum, no derivation, no dependency on products.stock at all.
  if (CENTRAL_WAREHOUSE_LEDGER_BACKED) {
    return warehouseBalance(userId, productId, centralWarehouseUuid);
  }
  const stock = await productStock(productId);
  if (stock.error) return { balance: 0, error: stock.error };
  const others = await nonCentralLedgerTotal(userId, productId, centralWarehouseUuid);
  if (others.error) return { balance: 0, error: others.error };
  return { balance: stock.stock - others.total, error: null as string | null };
}

// The one function transfer validation/availability should call: dispatches
// to the derived central-warehouse formula or the plain branch ledger sum.
export async function sourceWarehouseBalance(
  userId: string,
  productId: string,
  warehouseUuid: string,
  centralWarehouseUuid: string,
) {
  if (warehouseUuid === centralWarehouseUuid) {
    return centralWarehouseBalance(userId, productId, centralWarehouseUuid);
  }
  return warehouseBalance(userId, productId, warehouseUuid);
}

// Bulk product listing for one warehouse (GET /api/warehouses/:id/stock).
// Branch warehouses keep the existing pure-ledger behavior (only products
// with movement history there appear). The central warehouse instead lists
// EVERY product (since, by default, an untouched product's entire stock is
// at the central warehouse), with stock = products.stock - sum(branches).
export async function warehouseStockRowsFor(
  userId: string,
  warehouseUuidId: string,
  isCentral: boolean,
  categoryId?: string | null,
) {
  // Post-backfill: Champion Mart behaves exactly like a branch warehouse —
  // only products with ledger history there appear, same as everyone else.
  if (!isCentral || CENTRAL_WAREHOUSE_LEDGER_BACKED) {
    return warehouseStockRows(userId, warehouseUuidId, categoryId);
  }

  const { data: otherMovements, error: movError } = await (sb as any)
    .from("stock_movements")
    .select("product_id, quantity")
    .not("warehouse_id", "is", null)
    .neq("warehouse_id", warehouseUuidId);
  if (movError) return { rows: [], error: movError.message };

  const otherTotals = new Map<string, number>();
  for (const row of otherMovements ?? []) {
    const productId = String(row.product_id);
    otherTotals.set(productId, (otherTotals.get(productId) ?? 0) + numberOrZero(row.quantity));
  }

  let productsQuery = sb
    .from("products")
    .select(
      "id,name,sku,stock,price,cost,reorder_level,reorder_point,category_id,product_categories!products_category_id_fkey(name)",
    )
    .order("name");
  if (categoryId) productsQuery = productsQuery.eq("category_id", categoryId);
  const { data: products, error: productError } = await productsQuery;
  if (productError) return { rows: [], error: productError.message };

  const rows = (products ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stock: numberOrZero(p.stock) - (otherTotals.get(String(p.id)) ?? 0),
    reorderPoint: p.reorder_point ?? p.reorder_level ?? 0,
    price: p.price,
    cost: p.cost,
    categoryId: p.category_id,
    category: p.product_categories?.name ?? "Other",
  }));
  return { rows, error: null as string | null };
}

// Bulk per-warehouse totals for the Warehouse Report — one row per real
// warehouse (including the central one), never a separate "General Stock"
// row. The central warehouse's totals are derived (products.stock minus
// every other warehouse), not read from its own ledger rows.
export async function warehouseInventoryTotalsFor(userId: string) {
  // Post-backfill: no derivation needed — every warehouse, central included,
  // is a plain ledger sum.
  if (CENTRAL_WAREHOUSE_LEDGER_BACKED) return warehouseInventoryTotals(userId);

  const central = await resolveCentralWarehouse(userId);
  if (central.error || !central.warehouse) {
    return {
      totals: new Map<
        string,
        { totalUnits: number; productCount: number; retailValue: number; costValue: number }
      >(),
      error: central.error ?? "No central warehouse configured",
    };
  }
  const centralUuid = String(central.warehouse.uuid_id ?? central.warehouse.id);

  const branchTotals = await warehouseInventoryTotals(userId);
  if (branchTotals.error) return branchTotals;
  // warehouseInventoryTotals() only knows about warehouses that already have
  // ledger rows, so it may include a (spurious, pre-fix) entry keyed by the
  // central warehouse's own uuid. Discard it — the central row is always
  // derived below, never read from its own ledger.
  branchTotals.totals.delete(centralUuid);

  const { data: products, error: prodError } = await sb
    .from("products")
    .select("id, stock, price, cost");
  if (prodError) return { totals: branchTotals.totals, error: prodError.message };

  const { data: nonCentralMovements, error: movError } = await (sb as any)
    .from("stock_movements")
    .select("product_id, quantity")
    .not("warehouse_id", "is", null)
    .neq("warehouse_id", centralUuid);
  if (movError) return { totals: branchTotals.totals, error: movError.message };

  const perProductOthers = new Map<string, number>();
  for (const row of nonCentralMovements ?? []) {
    const pId = String(row.product_id);
    perProductOthers.set(pId, (perProductOthers.get(pId) ?? 0) + numberOrZero(row.quantity));
  }

  let centralUnits = 0;
  let centralProductCount = 0;
  let centralRetail = 0;
  let centralCost = 0;
  for (const p of (products ?? []) as any[]) {
    const productId = String(p.id);
    const stock = numberOrZero(p.stock) - (perProductOthers.get(productId) ?? 0);
    if (stock === 0) continue;
    centralUnits += stock;
    if (stock > 0) centralProductCount += 1;
    centralRetail += stock * numberOrZero(p.price);
    centralCost += stock * numberOrZero(p.cost);
  }

  branchTotals.totals.set(centralUuid, {
    totalUnits: centralUnits,
    productCount: centralProductCount,
    retailValue: centralRetail,
    costValue: centralCost,
  });

  return { totals: branchTotals.totals, error: null as string | null };
}
