import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Covers the role-consistent visibility fix across the three import-batch
// endpoints: products.import.history.ts (list), products.import.$batchId.ts
// (detail), and products.import.$batchId.rollback.ts (rollback). Before this
// fix, rollback.ts alone allowed an admin to act on a colleague's batch,
// while history.ts and $batchId.ts hard-filtered everything to
// `user_id = caller`, so an admin could never even find or open the batch
// they were otherwise allowed to roll back. All three now resolve the same
// "own vs. all" scope via resolveImportBatchScope/canAccessImportBatch in
// _import-helpers.ts (which itself just reuses the existing
// admin-or-manager loadResourceScope rule already used by sales, purchase
// orders, expenses, etc. - no new permission was invented).

describe("all three import-batch endpoints reuse the same shared authorization helper (no duplicated conditions)", () => {
  const helperPath = join(process.cwd(), "src/routes/api/_import-helpers.ts");
  const helperSource = readFileSync(helperPath, "utf8");

  it("_import-helpers.ts defines resolveImportBatchScope and canAccessImportBatch", () => {
    expect(helperSource).toMatch(/export async function resolveImportBatchScope/);
    expect(helperSource).toMatch(/export function canAccessImportBatch/);
  });

  for (const file of [
    "products.import.history.ts",
    "products.import.$batchId.ts",
    "products.import.$batchId.rollback.ts",
  ]) {
    it(`${file} imports the shared scope helper rather than re-implementing its own authorization condition`, () => {
      const source = readFileSync(join(process.cwd(), "src/routes/api", file), "utf8");
      expect(source).toMatch(/resolveImportBatchScope/);
    });
  }
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_A = "11111111-1111-1111-1111-111111111111";
const STAFF_B = "22222222-2222-2222-2222-222222222222";
const ADMIN_ID = "33333333-3333-3333-3333-333333333333";
const MANAGER_ID = "44444444-4444-4444-4444-444444444444";
const BATCH_A_ID = "55555555-5555-5555-5555-555555555555";
const BATCH_B_ID = "66666666-6666-6666-6666-666666666666";
const PRODUCT_ID = "77777777-7777-7777-7777-777777777777";

/** Per-table FIFO of canned responses, mirroring supabase-js's from(table)
 *  returning a fresh, chainable, awaitable builder each call. Mirrors the
 *  helper already established in -import-rollback-redesign.test.ts and
 *  -import-batch-detail.test.ts. */
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

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_A_ID,
    user_id: STAFF_A,
    status: "committed",
    created_at: new Date().toISOString(),
    committed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    filename: "staff-a-import.csv",
    imported_by_name: "staffa@example.com",
    total_rows: 1,
    imported_count: 1,
    updated_count: 0,
    error_count: 0,
    import_mode: "insert",
    overwrite_fields: null,
    categories_created: [],
    rollback_report: null,
    snapshot: [{ id: PRODUCT_ID, action: "update", rowNum: 2, stockAdded: 0, prevValues: { name: "Old Name" } }],
    ...overrides,
  };
}

async function callHistory(sb: ReturnType<typeof makeSb>) {
  (supabaseAdmin.from as any).mockImplementation(sb.from);
  const { Route } = await import("./products.import.history");
  return (Route as any).options.server.handlers.GET({
    request: new Request("http://localhost/api/products/import/history", {
      headers: { authorization: "Bearer test-token" },
    }),
  });
}

async function callDetail(sb: ReturnType<typeof makeSb>, batchId = BATCH_A_ID) {
  (supabaseAdmin.from as any).mockImplementation(sb.from);
  const { Route } = await import("./products.import.$batchId");
  return (Route as any).options.server.handlers.GET({
    request: new Request(`http://localhost/api/products/import/${batchId}`, {
      headers: { authorization: "Bearer test-token" },
    }),
    params: { batchId },
  });
}

async function callRollback(sb: ReturnType<typeof makeSb>, batchId = BATCH_A_ID) {
  (supabaseAdmin.from as any).mockImplementation(sb.from);
  const { Route } = await import("./products.import.$batchId.rollback");
  return (Route as any).options.server.handlers.DELETE({
    request: new Request(`http://localhost/api/products/import/${batchId}/rollback`, {
      method: "DELETE",
      headers: { authorization: "Bearer test-token" },
    }),
    params: { batchId },
  });
}

describe("products.import.history.ts — scope-based visibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("staff sees their own batch: the query is filtered to user_id = caller", async () => {
    const sb = makeSb();
    authAsUser(STAFF_A);
    sb.queue("user_roles", { data: [], error: null }); // no privileged role -> "own"
    sb.queue("product_import_batches", { data: [batchRow()], error: null });

    const response = await callHistory(sb);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0].batchId).toBe(BATCH_A_ID);

    const call = sb.callsFor("product_import_batches", 0);
    const eqFilters = call.filter((c) => c.method === "eq");
    expect(eqFilters).toEqual([{ method: "eq", args: ["user_id", STAFF_A] }]);
  });

  it("admin sees all batches from every uploader: the query carries no user_id filter", async () => {
    const sb = makeSb();
    authAsUser(ADMIN_ID);
    sb.queue("user_roles", { data: [{ role: "admin" }], error: null });
    sb.queue("product_import_batches", {
      data: [
        batchRow(),
        batchRow({ id: BATCH_B_ID, user_id: STAFF_B, imported_by_name: "staffb@example.com" }),
      ],
      error: null,
    });

    const response = await callHistory(sb);
    const body = await response.json();

    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b: any) => b.batchId)).toEqual(
      expect.arrayContaining([BATCH_A_ID, BATCH_B_ID]),
    );
    // Requirement: uploader identity must be visible so an admin reviewing
    // everyone's imports can tell whose batch is whose.
    expect(body.batches.map((b: any) => b.importedByName)).toEqual(
      expect.arrayContaining(["staffa@example.com", "staffb@example.com"]),
    );

    const call = sb.callsFor("product_import_batches", 0);
    expect(call.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(false);
  });

  it("manager gets the same 'all' scope as admin (the reused loadResourceScope rule, not a new permission)", async () => {
    const sb = makeSb();
    authAsUser(MANAGER_ID);
    sb.queue("user_roles", { data: [{ role: "manager" }], error: null });
    sb.queue("product_import_batches", {
      data: [batchRow(), batchRow({ id: BATCH_B_ID, user_id: STAFF_B })],
      error: null,
    });

    const response = await callHistory(sb);
    const body = await response.json();
    expect(body.batches).toHaveLength(2);
  });

  it("denies an unauthenticated request", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    const { Route } = await import("./products.import.history");
    const response = await (Route as any).options.server.handlers.GET({
      request: new Request("http://localhost/api/products/import/history"), // no Authorization header
    });
    expect(response.status).toBe(401);
  });
});

describe("products.import.$batchId.ts — detail panel scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("staff can open their own batch's detail", async () => {
    const sb = makeSb();
    authAsUser(STAFF_A);
    sb.queue("product_import_batches", { data: batchRow(), error: null });
    sb.queue("user_roles", { data: [], error: null });
    sb.queue("products", {
      data: [{ id: PRODUCT_ID, name: "New Name", sku: "SKU-1", price: 10, category: "Groceries" }],
      error: null,
    });

    const response = await callDetail(sb);
    expect(response.status).toBe(200);
  });

  it("staff cannot open another staff member's batch detail: 404, and the response leaks no batch/product data", async () => {
    const sb = makeSb();
    authAsUser(STAFF_B);
    sb.queue("product_import_batches", { data: batchRow(), error: null }); // owned by STAFF_A
    sb.queue("user_roles", { data: [], error: null }); // STAFF_B has no privileged role

    const response = await callDetail(sb);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(Object.keys(body)).toEqual(["message"]);
    expect(body.message).toBe("Not found");
    // Nothing product-related was ever queried once access was denied.
    expect(sb.callCountFor("products")).toBe(0);
  });

  it("admin opens another staff member's batch detail, and liveProducts includes the product regardless of who created it", async () => {
    const sb = makeSb();
    authAsUser(ADMIN_ID);
    sb.queue("product_import_batches", { data: batchRow(), error: null }); // owned by STAFF_A
    sb.queue("user_roles", { data: [{ role: "admin" }], error: null });
    sb.queue("products", {
      data: [{ id: PRODUCT_ID, name: "New Name", sku: "SKU-1", price: 10, category: "Groceries" }],
      error: null,
    });

    const response = await callDetail(sb);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importedByName).toBe("staffa@example.com");
    expect(body.liveProducts).toHaveLength(1);
    expect(body.liveProducts[0].id).toBe(PRODUCT_ID);

    // The products query itself must never filter by the viewer's own
    // user_id - it stays ownership-agnostic regardless of caller scope.
    const productsCall = sb.callsFor("products", 0);
    expect(productsCall.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(false);
  });
});

describe("products.import.$batchId.rollback.ts — rollback scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("staff cannot roll back another staff member's batch: 404, and nothing is mutated", async () => {
    const sb = makeSb();
    authAsUser(STAFF_B);
    sb.queue("product_import_batches", { data: batchRow(), error: null }); // owned by STAFF_A
    sb.queue("user_roles", { data: [], error: null });

    const response = await callRollback(sb);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("Not found");
    // Only the initial read happened - no claim, no product/stock mutation.
    expect(sb.callCountFor("product_import_batches")).toBe(1);
    expect(sb.callCountFor("products")).toBe(0);
  });

  it("admin rolls back another staff member's eligible batch successfully", async () => {
    const sb = makeSb();
    authAsUser(ADMIN_ID);
    sb.queue("product_import_batches", { data: batchRow(), error: null }); // owned by STAFF_A
    sb.queue("user_roles", { data: [{ role: "admin" }], error: null });
    // atomic claim: committed -> rolling_back
    sb.queue("product_import_batches", { data: { id: BATCH_A_ID }, error: null });
    // field-restore update (stockAdded is 0, so reverseStockIfAny short-circuits with no DB calls)
    sb.queue("products", { data: null, error: null });
    // final status update
    sb.queue("product_import_batches", { data: null, error: null });
    sb.queue("notifications", { data: null, error: null });

    const response = await callRollback(sb);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("rolled_back");
    expect(body.restored).toBe(1);
  });
});

describe("consistency: a regular staff member is denied identically across all three endpoints for a colleague's batch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("history excludes it, detail 404s, and rollback 404s", async () => {
    const historySb = makeSb();
    authAsUser(STAFF_B);
    historySb.queue("user_roles", { data: [], error: null });
    historySb.queue("product_import_batches", { data: [], error: null }); // a real DB would filter STAFF_A's row out entirely
    const historyResponse = await callHistory(historySb);
    const historyBody = await historyResponse.json();
    expect(historyBody.batches).toHaveLength(0);

    const detailSb = makeSb();
    authAsUser(STAFF_B);
    detailSb.queue("product_import_batches", { data: batchRow(), error: null });
    detailSb.queue("user_roles", { data: [], error: null });
    const detailResponse = await callDetail(detailSb);
    expect(detailResponse.status).toBe(404);

    const rollbackSb = makeSb();
    authAsUser(STAFF_B);
    rollbackSb.queue("product_import_batches", { data: batchRow(), error: null });
    rollbackSb.queue("user_roles", { data: [], error: null });
    const rollbackResponse = await callRollback(rollbackSb);
    expect(rollbackResponse.status).toBe(404);
  });
});
