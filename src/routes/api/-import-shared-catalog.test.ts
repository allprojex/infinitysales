import { beforeEach, describe, expect, it, vi } from "vitest";

// Pure matching-logic tests (no mocking needed) live first; the route-level
// tests below exercise products.import.commit.ts and
// products.import.$batchId.rollback.ts against a mocked supabase client to
// prove the shared-catalog fix end to end: a product created by one account
// is found, updated, and — on rollback — restored by a *different* account,
// without ever requiring a user_id match.

import { buildProductMatchIndex, matchExistingProduct } from "./_import-helpers";

describe("buildProductMatchIndex / matchExistingProduct (shared catalog)", () => {
  const staffAProduct = {
    id: "prod-rice-5kg",
    name: "Rice 5kg",
    sku: "RICE-5KG",
    barcode: "6009123456789",
  };

  it("matches a row against a product created by a different account purely by identity, never by ownership", () => {
    // The index carries no notion of who created each row — it is built from
    // the full shared catalog, so a colleague's product is just as matchable
    // as the caller's own.
    const index = buildProductMatchIndex([staffAProduct]);

    const { match, matchedBy } = matchExistingProduct(index, {
      sku: null,
      barcode: null,
      name: "Rice 5kg",
    });

    expect(match?.id).toBe("prod-rice-5kg");
    expect(matchedBy).toBe("name");
  });

  it("prefers a SKU match over a barcode or name match", () => {
    const index = buildProductMatchIndex([
      { id: "by-sku", name: "Widget", sku: "SKU-1", barcode: "BC-1" },
      { id: "by-name-only", name: "Widget", sku: null, barcode: null },
    ]);

    const { match, matchedBy } = matchExistingProduct(index, {
      sku: "SKU-1",
      barcode: "BC-1",
      name: "Widget",
    });

    expect(match?.id).toBe("by-sku");
    expect(matchedBy).toBe("sku");
  });

  it("falls back to barcode when no SKU is supplied", () => {
    const index = buildProductMatchIndex([
      { id: "by-barcode", name: "Different name entirely", sku: null, barcode: "BC-2" },
    ]);

    const { match, matchedBy } = matchExistingProduct(index, {
      sku: null,
      barcode: "BC-2",
      name: "Some CSV name",
    });

    expect(match?.id).toBe("by-barcode");
    expect(matchedBy).toBe("barcode");
  });

  it("falls back to normalized name only when neither SKU nor barcode is supplied", () => {
    const index = buildProductMatchIndex([
      { id: "p1", name: "  Nido   Sachet  ", sku: null, barcode: null },
    ]);

    const { match, matchedBy } = matchExistingProduct(index, {
      sku: null,
      barcode: null,
      name: "nido sachet",
    });

    expect(match?.id).toBe("p1");
    expect(matchedBy).toBe("name");
  });

  it("does not match on price/cost — those fields aren't part of identity at all", () => {
    const index = buildProductMatchIndex([{ id: "p1", name: "Soap", sku: null, barcode: null }]);
    // matchExistingProduct's input shape has no price/cost fields to begin
    // with, so a price change can never prevent (or force) a match.
    const { match } = matchExistingProduct(index, { sku: null, barcode: null, name: "Soap" });
    expect(match?.id).toBe("p1");
  });

  it("returns no match when nothing lines up", () => {
    const index = buildProductMatchIndex([{ id: "p1", name: "Soap", sku: "S1", barcode: "B1" }]);
    const { match, matchedBy } = matchExistingProduct(index, {
      sku: "S2",
      barcode: "B2",
      name: "Shampoo",
    });
    expect(match).toBeNull();
    expect(matchedBy).toBeNull();
  });
});

// ── Route-level: products.import.commit.ts + rollback ──────────────────────

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_A = "11111111-1111-1111-1111-111111111111"; // original creator
const STAFF_B = "22222222-2222-2222-2222-222222222222"; // importer, in the update tests
const PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const BATCH_ID = "44444444-4444-4444-4444-444444444444";
const CATEGORY_ID = "55555555-5555-5555-5555-555555555555";
const WAREHOUSE_UUID = "66666666-6666-6666-6666-666666666666";

/** A per-table FIFO of canned responses, mirroring supabase-js's from(table)
 *  returning a fresh, chainable, awaitable builder each call. Recording every
 *  method call (including update/insert payloads) lets tests assert exactly
 *  what filters and payloads the route sent to the database. */
function makeSb() {
  const queues: Record<string, { data: unknown; error: unknown }[]> = {};
  const calls: Record<string, { method: string; args: unknown[] }[][]> = {};
  const CHAIN_METHODS = [
    "select",
    "eq",
    "neq",
    "in",
    "order",
    "not",
    "ilike",
    "limit",
    "update",
    "insert",
    "delete",
  ];
  function from(table: string) {
    const queue = queues[table];
    if (!queue || !queue.length) {
      throw new Error(`-import-shared-catalog.test.ts: no mocked response queued for "${table}"`);
    }
    const result = queue.shift()!;
    const tableCalls: { method: string; args: unknown[] }[] = [];
    (calls[table] ??= []).push(tableCalls);
    const builder: any = {};
    for (const m of CHAIN_METHODS) {
      builder[m] = vi.fn((...args: unknown[]) => {
        tableCalls.push({ method: m, args });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }
  return {
    from: vi.fn(from),
    queue(table: string, result: { data: unknown; error: unknown }) {
      (queues[table] ??= []).push(result);
    },
    callsFor(table: string, callIndex = 0) {
      return (calls[table] ?? [])[callIndex] ?? [];
    },
  };
}

function authAsUser(userId: string) {
  (supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: userId, email: `${userId}@example.com`, user_metadata: {} } },
    error: null,
  });
}

describe("products.import.commit.ts — shared-catalog update path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Staff B's import updates Staff A's existing product without reassigning its creator attribution", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(STAFF_B);

    // 1. batch fetch (scoped to the committing user — Staff B is the one who
    //    ran preview, so this stays user-scoped; that's session ownership,
    //    not catalog visibility).
    sb.queue("product_import_batches", {
      data: {
        id: BATCH_ID,
        user_id: STAFF_B,
        status: "preview",
        content_hash: null, // skip the duplicate-run guard branch
        import_mode: "upsert",
        filename: "rice.csv",
        pending_rows: [
          {
            rowNum: 2,
            matchedExistingId: PRODUCT_ID, // resolved by preview.ts against the SHARED catalog — belongs to Staff A
            matchedBy: "name",
            prevValues: { stock: 10 },
            data: {
              name: "Rice 5kg",
              sku: null,
              barcode: null,
              category: "Groceries",
              brand: null,
              price: "50",
              cost: "40",
              sellingPrice: null,
              wholesalePrice: null,
              stock: 20,
              unit: null,
              description: null,
              reorderPoint: 0,
              imageUrl: null,
              supplier: null,
              taxInfo: null,
              expiryDate: null,
              batchLotNumber: null,
            },
          },
        ],
      },
      error: null,
    });

    // 2. resolveCentralWarehouse
    sb.queue("warehouses", {
      data: { id: 1, uuid_id: WAREHOUSE_UUID, name: "Champion Mart" },
      error: null,
    });

    // 3. category cache load — category already exists, resolved from cache
    sb.queue("product_categories", {
      data: [{ id: CATEGORY_ID, name: "Groceries" }],
      error: null,
    });

    // 4. recordStockMovement -> warehouseBalance's stock_movements select
    sb.queue("stock_movements", { data: [{ quantity: 10 }], error: null });
    // 5. recordStockMovement's own insert
    sb.queue("stock_movements", { data: null, error: null });

    // 6. current stock read before the update
    sb.queue("products", { data: { stock: 10 }, error: null });
    // 7. the update itself
    sb.queue("products", { data: { id: PRODUCT_ID }, error: null });

    // 8. batch status -> committed
    sb.queue("product_import_batches", { data: null, error: null });
    // 9. notify()
    sb.queue("notifications", { data: null, error: null });

    const { Route } = await import("./products.import.commit");
    const response = await (Route as any).options.server.handlers.POST({
      request: new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ batchId: BATCH_ID, selectedRowNums: [2] }),
      }),
    } as any);

    const body = await response.json();
    expect(body.errors ?? []).toEqual([]);
    expect(body.updatedCount).toBe(1);

    // The actual regression: the update must target the matched product by
    // id alone (no user_id filter that would silently no-op a cross-account
    // match), and must never write Staff B's id into user_id.
    const updateCall = sb.callsFor("products", 1); // second products call = the update
    const update = updateCall.find((c) => c.method === "update");
    const eqFilters = updateCall.filter((c) => c.method === "eq");

    expect(update).toBeTruthy();
    expect((update!.args[0] as Record<string, unknown>).user_id).toBeUndefined();
    expect(eqFilters).toEqual([{ method: "eq", args: ["id", PRODUCT_ID] }]);
  });

  it("blocks a re-import when ANY account already committed the identical file (organization-wide content-hash guard)", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(STAFF_B);

    // 1. batch fetch
    sb.queue("product_import_batches", {
      data: {
        id: BATCH_ID,
        user_id: STAFF_B,
        status: "preview",
        content_hash: "same-hash-regardless-of-uploader",
        import_mode: "upsert",
        filename: "rice.csv",
        pending_rows: [],
      },
      error: null,
    });
    // 2. content-hash duplicate lookup finds a commit made by a DIFFERENT
    //    account (Staff A) — must still block, since the guard is no longer
    //    scoped to the caller's own user_id.
    sb.queue("product_import_batches", {
      data: {
        id: "prior-batch",
        filename: "rice-original.csv",
        committed_at: "2026-07-01T00:00:00Z",
      },
      error: null,
    });

    const { Route } = await import("./products.import.commit");
    const response = await (Route as any).options.server.handlers.POST({
      request: new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ batchId: BATCH_ID, selectedRowNums: [] }),
      }),
    } as any);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.message).toBe("This inventory file has already been imported.");
    expect(body.duplicateOfBatchId).toBe("prior-batch");
  });

  it("proceeds when forceDuplicate is set, even though another account already committed the identical file", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(STAFF_B);

    sb.queue("product_import_batches", {
      data: {
        id: BATCH_ID,
        user_id: STAFF_B,
        status: "preview",
        content_hash: "same-hash-regardless-of-uploader",
        import_mode: "upsert",
        filename: "rice.csv",
        pending_rows: [],
      },
      error: null,
    });
    // resolveCentralWarehouse
    sb.queue("warehouses", {
      data: { id: 1, uuid_id: WAREHOUSE_UUID, name: "Champion Mart" },
      error: null,
    });
    // category cache load (no rows selected, so the loop body never runs)
    sb.queue("product_categories", { data: [], error: null });
    // batch -> committed
    sb.queue("product_import_batches", { data: null, error: null });
    // notify()
    sb.queue("notifications", { data: null, error: null });

    const { Route } = await import("./products.import.commit");
    const response = await (Route as any).options.server.handlers.POST({
      request: new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ batchId: BATCH_ID, selectedRowNums: [], forceDuplicate: true }),
      }),
    } as any);

    expect(response.status).toBe(200);
  });
});

describe("products.import.$batchId.rollback.ts — batch/snapshot-based, not ownership-based", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets an admin roll back a batch that updated another account's product, and restores it by id alone", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(STAFF_B); // Staff B is not the batch owner (Staff A committed it), but IS an admin here

    const recentIso = new Date().toISOString();
    sb.queue("product_import_batches", {
      data: {
        id: BATCH_ID,
        user_id: STAFF_A, // batch was committed by Staff A, not the caller
        status: "committed",
        created_at: recentIso,
        filename: "rice.csv",
        snapshot: [
          {
            action: "update",
            id: PRODUCT_ID, // the product staff B's rollback must restore, though it belongs to Staff A's batch
            rowNum: 2,
            prevValues: { name: "Rice 5kg", stock: 10 },
            stockAdded: 20,
          },
        ],
      },
      error: null,
    });
    // resolveImportBatchScope's user_roles lookup - Staff B holds the admin role
    sb.queue("user_roles", { data: [{ role: "admin" }], error: null });
    // atomic claim: committed -> rolling_back
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });

    // stock/warehouse lookup before the reversal movement
    sb.queue("products", { data: { stock: 30, warehouse_id: WAREHOUSE_UUID }, error: null });
    // warehouseBalance's stock_movements select inside recordStockMovement
    sb.queue("stock_movements", { data: [{ quantity: 20 }], error: null });
    // recordStockMovement's insert
    sb.queue("stock_movements", { data: null, error: null });
    // reverseStockIfAny's own stock write-back
    sb.queue("products", { data: null, error: null });
    // the field-restore update (name, etc. from prevValues)
    sb.queue("products", { data: null, error: null });
    // batch status -> rolled_back
    sb.queue("product_import_batches", { data: null, error: null });
    // notify()
    sb.queue("notifications", { data: null, error: null });

    const { Route } = await import("./products.import.$batchId.rollback");
    const response = await (Route as any).options.server.handlers.DELETE({
      request: new Request(`http://localhost/api/products/import/${BATCH_ID}/rollback`, {
        method: "DELETE",
        headers: { authorization: "Bearer test-token" },
      }),
      params: { batchId: BATCH_ID },
    } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.restored).toBe(1);

    const restoreCall = sb.callsFor("products", 2); // third products call = the field-restore update
    const update = restoreCall.find((c) => c.method === "update");
    const eqFilters = restoreCall.filter((c) => c.method === "eq");
    expect(update).toBeTruthy();
    expect(eqFilters).toEqual([{ method: "eq", args: ["id", PRODUCT_ID] }]);
  });

  it("404s (never 403) when the caller is neither the batch owner nor an admin/manager, so an out-of-scope batch id can't be confirmed to exist", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(STAFF_B);

    sb.queue("product_import_batches", {
      data: {
        id: BATCH_ID,
        user_id: STAFF_A,
        status: "committed",
        created_at: new Date().toISOString(),
        filename: "rice.csv",
        snapshot: [],
      },
      error: null,
    });
    // resolveImportBatchScope's user_roles lookup - Staff B holds no privileged role
    sb.queue("user_roles", { data: [], error: null });

    const { Route } = await import("./products.import.$batchId.rollback");
    const response = await (Route as any).options.server.handlers.DELETE({
      request: new Request(`http://localhost/api/products/import/${BATCH_ID}/rollback`, {
        method: "DELETE",
        headers: { authorization: "Bearer test-token" },
      }),
      params: { batchId: BATCH_ID },
    } as any);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toBe("Not found");
  });
});
