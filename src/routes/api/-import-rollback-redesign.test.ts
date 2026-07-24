import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Static guard: the whole point of this redesign is that rollback NEVER
// deletes or mutates a stock_movements row (the stock_movements_immutable
// trigger blocks that at the database level anyway) - it always posts an
// offsetting import_reversal movement via the shared recordStockMovement
// helper instead. Reading the source directly makes this a permanent
// regression guard, independent of any particular test scenario below.
describe("rollback.ts never touches stock_movements directly", () => {
  it("contains no literal reference to the stock_movements table", () => {
    const path = join(process.cwd(), "src/routes/api/products.import.$batchId.rollback.ts");
    const source = readFileSync(path, "utf8");
    // Only mentioned in the explanatory comment block, never as a table name
    // passed to .from(...).
    expect(source).not.toMatch(/\.from\(\s*["']stock_movements["']/);
  });

  it("-stock-helpers.ts's recordStockMovement only ever selects and inserts, never deletes or updates stock_movements", () => {
    const path = join(process.cwd(), "src/routes/api/-stock-helpers.ts");
    const source = readFileSync(path, "utf8");
    const fnStart = source.indexOf("export async function recordStockMovement");
    const fnBody = source.slice(fnStart, source.indexOf("\n}", fnStart));
    expect(fnBody).toContain(".insert(");
    expect(fnBody).not.toMatch(/\.from\(\s*["']stock_movements["']\)[\s\S]*?\.(delete|update)\(/);
  });
});

// ── Behavioral tests against a mocked supabase client ──────────────────────

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
vi.mock("./_auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_auth-helpers")>();
  return { ...actual, isAdmin: vi.fn() };
});

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BATCH_ID = "22222222-2222-2222-2222-222222222222";
const PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-4444-444444444444";
const WAREHOUSE_UUID = "55555555-5555-5555-5555-555555555555";

const DIRECT_REFERENCE_TABLES = [
  "sale_lines",
  "sale_return_lines",
  "stock_take_items",
  "stock_adjustments",
  "serial_numbers",
  "reorder_rules",
  "price_list_items",
  "esl_devices",
  "purchase_return_items",
];
const JSON_ITEMS_TABLES = ["product_transfers", "purchase_orders", "supplier_invoices"];

/** Per-table FIFO of canned responses, mirroring supabase-js's from(table)
 *  returning a fresh, chainable, awaitable builder each call. */
function makeSb() {
  const queues: Record<string, { data: unknown; error: unknown; count?: number }[]> = {};
  const calls: Record<string, { method: string; args: unknown[] }[][]> = {};
  const CHAIN_METHODS = [
    "select",
    "eq",
    "neq",
    "in",
    "is",
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
      throw new Error(`no mocked response queued for table "${table}"`);
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
    queue(table: string, result: { data: unknown; error: unknown; count?: number }) {
      (queues[table] ??= []).push(result);
    },
    /** Queues an empty/no-match response for every table findReferencedProductIds checks. */
    queueNoBusinessReferences() {
      for (const t of DIRECT_REFERENCE_TABLES) this.queue(t, { data: [], error: null });
      for (const t of JSON_ITEMS_TABLES) this.queue(t, { data: [], error: null });
      this.queue("audit_logs", { data: [], error: null });
    },
    callsFor(table: string, callIndex = 0) {
      return (calls[table] ?? [])[callIndex] ?? [];
    },
    callCountFor(table: string) {
      return (calls[table] ?? []).length;
    },
  };
}

function authAsUser(userId: string) {
  (supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: userId, email: `${userId}@example.com`, user_metadata: {} } },
    error: null,
  });
}

function rollbackRequest() {
  return new Request(`http://localhost/api/products/import/${BATCH_ID}/rollback`, {
    method: "DELETE",
    headers: { authorization: "Bearer test-token" },
  });
}

async function callRollback() {
  const { Route } = await import("./products.import.$batchId.rollback");
  return (Route as any).options.server.handlers.DELETE({
    request: rollbackRequest(),
    params: { batchId: BATCH_ID },
  });
}

/** Queues the 4 calls reverseStockIfAny makes for one product with the given
 *  current stock and stockAdded amount: read stock/warehouse, read the
 *  ledger balance, insert the reversal movement, write the new stock. */
function queueStockReversal(sb: ReturnType<typeof makeSb>, currentStock: number, stockAdded: number) {
  sb.queue("products", { data: { stock: currentStock, warehouse_id: null }, error: null });
  sb.queue("stock_movements", { data: [{ quantity: stockAdded }], error: null }); // warehouseBalance
  sb.queue("stock_movements", { data: null, error: null }); // the reversal insert
  sb.queue("products", { data: null, error: null }); // stock write-back
}

function baseBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    user_id: USER_ID,
    status: "committed",
    created_at: new Date().toISOString(),
    committed_at: new Date().toISOString(),
    filename: "test.csv",
    rollback_report: null,
    categories_created: [],
    snapshot: [],
    ...overrides,
  };
}

describe("Undo Import — new products created by an import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives a newly-inserted product with no business references, and cleans up the category it created", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({
        categories_created: [CATEGORY_ID],
        snapshot: [{ id: PRODUCT_ID, action: "insert", rowNum: 2, stockAdded: 10 }],
      }),
      error: null,
    });
    // resolveImportBatchScope's user_roles lookup
    sb.queue("user_roles", { data: [], error: null });
    // atomic claim
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });
    // reverseStockIfAny
    queueStockReversal(sb, 10, 10);
    // findReferencedProductIds — nothing references it
    sb.queueNoBusinessReferences();
    // archive the product
    sb.queue("products", { data: null, error: null });
    // category lookup + cleanup
    sb.queue("product_categories", {
      data: { id: CATEGORY_ID, name: "QA Category", is_active: true, created_at: new Date().toISOString() },
      error: null,
    });
    sb.queue("products", { data: null, error: null, count: 0 }); // zero active products left in category
    sb.queue("product_categories", { data: null, error: null }); // archive category
    // final status update + notify
    sb.queue("product_import_batches", { data: null, error: null });
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("rolled_back");
    expect(body.archived).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.categoriesArchived).toEqual([{ id: CATEGORY_ID, name: "QA Category" }]);
    expect(body.report[0]).toMatchObject({ id: PRODUCT_ID, outcome: "reversed_and_archived" });
  });

  it("reverses the stock but does NOT archive a product that has been sold, and flags it for manual review", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({
        snapshot: [{ id: PRODUCT_ID, action: "insert", rowNum: 2, stockAdded: 10 }],
      }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });
    queueStockReversal(sb, 10, 10);

    // findReferencedProductIds: sale_lines has a match, everything else empty
    for (const t of DIRECT_REFERENCE_TABLES) {
      sb.queue(t, t === "sale_lines" ? { data: [{ product_id: PRODUCT_ID }], error: null } : { data: [], error: null });
    }
    for (const t of JSON_ITEMS_TABLES) sb.queue(t, { data: [], error: null });
    sb.queue("audit_logs", { data: [], error: null });

    sb.queue("product_import_batches", { data: null, error: null }); // final status
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();

    expect(body.status).toBe("rolled_back"); // reversed successfully, just not archived
    expect(body.manualReview).toBe(1);
    expect(body.archived).toBe(0);
    expect(body.report[0].outcome).toBe("reversed_manual_review");
    // The product itself must never have been archived - only the 2 reads/
    // writes reverseStockIfAny itself performs, no extra archive update.
    expect(sb.callCountFor("products")).toBe(2);
  });

  it("flags a transferred product (jsonb items reference) for manual review instead of archiving", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({ snapshot: [{ id: PRODUCT_ID, action: "insert", rowNum: 2, stockAdded: 5 }] }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });
    queueStockReversal(sb, 5, 5);

    for (const t of DIRECT_REFERENCE_TABLES) sb.queue(t, { data: [], error: null });
    sb.queue("product_transfers", { data: [{ items: [{ productId: PRODUCT_ID }] }], error: null });
    sb.queue("purchase_orders", { data: [], error: null });
    sb.queue("supplier_invoices", { data: [], error: null });
    sb.queue("audit_logs", { data: [], error: null });

    sb.queue("product_import_batches", { data: null, error: null });
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();
    expect(body.manualReview).toBe(1);
    expect(body.archived).toBe(0);
  });

  it("flags a product that appeared in a stock take for manual review instead of archiving", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({ snapshot: [{ id: PRODUCT_ID, action: "insert", rowNum: 2, stockAdded: 5 }] }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });
    queueStockReversal(sb, 5, 5);

    for (const t of DIRECT_REFERENCE_TABLES) {
      sb.queue(
        t,
        t === "stock_take_items" ? { data: [{ product_id: PRODUCT_ID }], error: null } : { data: [], error: null },
      );
    }
    for (const t of JSON_ITEMS_TABLES) sb.queue(t, { data: [], error: null });
    sb.queue("audit_logs", { data: [], error: null });

    sb.queue("product_import_batches", { data: null, error: null });
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();
    expect(body.manualReview).toBe(1);
    expect(body.archived).toBe(0);
  });
});

describe("Undo Import — existing products the import updated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores snapshot fields and reverses the added stock via import_reversal, never touching the original movement", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({
        snapshot: [
          {
            id: PRODUCT_ID,
            action: "update",
            rowNum: 2,
            stockAdded: 5,
            prevValues: { name: "Rice 5kg", price: "20", stock: 10 },
          },
        ],
      }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });
    queueStockReversal(sb, 15, 5); // current stock 15 (10 + 5 the import added)
    sb.queue("products", { data: null, error: null }); // field restore update

    sb.queue("product_import_batches", { data: null, error: null });
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();

    expect(body.status).toBe("rolled_back");
    expect(body.restored).toBe(1);
    expect(body.report[0].outcome).toBe("restored");
  });
});

describe("Undo Import — idempotency and partial failure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a second rollback attempt on an already fully-rolled-back batch is rejected without reprocessing anything", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    sb.queue("product_import_batches", {
      data: baseBatch({ status: "rolled_back", rollback_report: [{ id: PRODUCT_ID, action: "insert", rowNum: 2, outcome: "reversed_and_archived" }] }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });

    const response = await callRollback();
    expect(response.status).toBe(409);
    // Only the initial batch fetch happened — no claim, no reversal, nothing else.
    expect(sb.callCountFor("product_import_batches")).toBe(1);
    expect(sb.callCountFor("stock_movements")).toBe(0);
  });

  it("marks the batch partially_rolled_back and reports the failure when one row's stock reversal fails, without losing progress", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(USER_ID);

    const OTHER_PRODUCT_ID = "66666666-6666-6666-6666-666666666666";
    sb.queue("product_import_batches", {
      data: baseBatch({
        snapshot: [
          { id: PRODUCT_ID, action: "insert", rowNum: 2, stockAdded: 10 },
          { id: OTHER_PRODUCT_ID, action: "insert", rowNum: 3, stockAdded: 4 },
        ],
      }),
      error: null,
    });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("product_import_batches", { data: { id: BATCH_ID }, error: null });

    // Row 1 (PRODUCT_ID): the product lookup itself fails.
    sb.queue("products", { data: null, error: { message: "connection reset" } });

    // Row 2 (OTHER_PRODUCT_ID): succeeds cleanly, no references.
    queueStockReversal(sb, 4, 4);
    for (const t of DIRECT_REFERENCE_TABLES) sb.queue(t, { data: [], error: null });
    for (const t of JSON_ITEMS_TABLES) sb.queue(t, { data: [], error: null });
    sb.queue("audit_logs", { data: [], error: null });
    sb.queue("products", { data: null, error: null }); // archive OTHER_PRODUCT_ID
    // Category-cleanup fallback (batch.categories_created is empty) looks up
    // the category of whatever it just archived - no category on this row.
    sb.queue("products", { data: [], error: null });

    sb.queue("product_import_batches", { data: null, error: null }); // final status
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback();
    const body = await response.json();

    expect(body.status).toBe("partially_rolled_back");
    expect(body.failed).toBe(1);
    expect(body.archived).toBe(1);
    const failedRow = body.report.find((r: any) => r.id === PRODUCT_ID);
    expect(failedRow.outcome).toBe("failed");
    expect(failedRow.detail).toMatch(/connection reset/);
  });
});
