import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  centralWarehouseBalance,
  resolveCentralWarehouse,
  sourceWarehouseBalance,
} from "./-stock-helpers";

const USER_ID = "d48ffa46-6b64-4c9a-b94c-61a20bd95065";
const CENTRAL_UUID = "421c5bcb-ac99-4446-b7d5-b5e34642fdcc";
const BRANCH_UUID = "20a1cdc7-a9b8-43dc-a2ba-e87b0dbae112";
const PRODUCT_ID = "a9888ed5-a49f-425b-9952-a7d751cdace1";

// A minimal fake query builder: every chain method returns itself, and the
// builder resolves (thenable) to the canned { data, error } result — mirrors
// how the real supabase-js query builder is both chainable and awaitable.
function queryable(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function mockTables(byTable: Record<string, { data: unknown; error: unknown }>) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table in byTable) return queryable(byTable[table]);
    throw new Error(`unexpected table: ${table}`);
  });
}

describe("resolveCentralWarehouse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds the account's is_default warehouse", async () => {
    mockTables({
      warehouses: {
        data: { id: 1, uuid_id: CENTRAL_UUID, name: "Champion Mart" },
        error: null,
      },
    });

    const result = await resolveCentralWarehouse(USER_ID);

    expect(result.error).toBeNull();
    expect(result.warehouse?.uuid_id).toBe(CENTRAL_UUID);
  });

  it("errors clearly when no warehouse is marked default (regression: don't crash, don't silently pick one)", async () => {
    mockTables({ warehouses: { data: null, error: null } });

    const result = await resolveCentralWarehouse(USER_ID);

    expect(result.warehouse).toBeNull();
    expect(result.error).toMatch(/no central warehouse/i);
  });
});

describe("centralWarehouseBalance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives balance as products.stock minus every other warehouse's ledger balance (invariant #16: sum of all warehouses == products.stock)", async () => {
    mockTables({
      products: {
        data: { stock: 26, warehouse_id: null, cost: null },
        error: null,
      },
      stock_movements: {
        data: [{ quantity: 1 }],
        error: null,
      },
    });

    const result = await centralWarehouseBalance(USER_ID, PRODUCT_ID, CENTRAL_UUID);

    expect(result.error).toBeNull();
    expect(result.balance).toBe(25); // 26 - 1
  });

  it("surfaces a negative balance rather than clamping it, so over-allocation is detectable (reconciliation finding: 2 Keys Whiskey / 8Pm Large today)", async () => {
    mockTables({
      products: { data: { stock: 0, warehouse_id: null, cost: null }, error: null },
      stock_movements: { data: [{ quantity: 2 }], error: null },
    });

    const result = await centralWarehouseBalance(USER_ID, PRODUCT_ID, CENTRAL_UUID);

    expect(result.balance).toBe(-2);
  });

  it("never sums the central warehouse's own movements — only queries with warehouse_id != central", async () => {
    let capturedNeq: unknown;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "products")
        return queryable({ data: { stock: 10, warehouse_id: null }, error: null });
      if (table === "stock_movements") {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          not: vi.fn(() => builder),
          neq: vi.fn((_col: string, val: string) => {
            capturedNeq = val;
            return builder;
          }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return builder;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    await centralWarehouseBalance(USER_ID, PRODUCT_ID, CENTRAL_UUID);

    expect(capturedNeq).toBe(CENTRAL_UUID);
  });
});

describe("sourceWarehouseBalance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the derived central formula when the warehouse is the central one", async () => {
    mockTables({
      products: { data: { stock: 21, warehouse_id: null, cost: null }, error: null },
      stock_movements: { data: [{ quantity: 1 }], error: null },
    });

    const result = await sourceWarehouseBalance(USER_ID, PRODUCT_ID, CENTRAL_UUID, CENTRAL_UUID);

    expect(result.balance).toBe(20);
  });

  it("uses the plain ledger sum for a branch warehouse (never the derived formula)", async () => {
    mockTables({
      stock_movements: { data: [{ quantity: 1 }, { quantity: 1 }], error: null },
    });

    const result = await sourceWarehouseBalance(USER_ID, PRODUCT_ID, BRANCH_UUID, CENTRAL_UUID);

    expect(result.balance).toBe(2);
  });
});
