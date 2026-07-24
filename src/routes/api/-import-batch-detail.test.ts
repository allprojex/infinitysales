import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// products.import.$batchId.ts's GET handler powers the Import History
// detail panel's "Imported products" table (see import-portal.tsx's
// toggleBatch -> BatchDetail.liveProducts). Products are a shared,
// organization-wide catalog (see products.ts's GET handler and the
// "authenticated users can view all products" RLS policy) - a batch can
// have updated a product created by a completely different account (the
// same premise commit ba35288 fixed for matching/rollback), so this
// endpoint's liveProducts lookup must never filter by the viewer's own
// user_id, or a colleague's product silently disappears from the panel
// and the UI falls back to showing stale pre-import values instead.

describe("products.import.$batchId.ts never filters the liveProducts lookup by the viewer's user_id", () => {
  it("contains no user_id filter on the products query (static regression guard)", () => {
    const path = join(process.cwd(), "src/routes/api/products.import.$batchId.ts");
    const source = readFileSync(path, "utf8");
    const fromIdx = source.indexOf('.from("products")');
    expect(fromIdx).toBeGreaterThan(-1);
    // The products query is a short, single statement ending at the first
    // semicolon after .from("products") - slicing there keeps this guard
    // scoped to that one query, not the unrelated (and intentionally
    // owner-scoped) product_import_batches fetch earlier in the file.
    const statementEnd = source.indexOf(";", fromIdx);
    const statement = source.slice(fromIdx, statementEnd);
    expect(statement).not.toMatch(/\.eq\(\s*["']user_id["']/);
  });
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VIEWER_ID = "11111111-1111-1111-1111-111111111111";
const BATCH_ID = "33333333-3333-3333-3333-333333333333";
const PRODUCT_OWN_ID = "44444444-4444-4444-4444-444444444444";
const PRODUCT_COLLEAGUE_ID = "55555555-5555-5555-5555-555555555555";

/** Per-table FIFO of canned responses, mirroring supabase-js's from(table)
 *  returning a fresh, chainable, awaitable builder each call. Mirrors the
 *  helper in -import-rollback-redesign.test.ts. */
function makeSb() {
  const queues: Record<string, { data: unknown; error: unknown }[]> = {};
  const calls: Record<string, { method: string; args: unknown[] }[][]> = {};
  const CHAIN_METHODS = ["select", "eq", "neq", "in", "is", "order", "limit"];
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

function detailRequest() {
  return new Request(`http://localhost/api/products/import/${BATCH_ID}`, {
    headers: { authorization: "Bearer test-token" },
  });
}

async function callDetail() {
  const { Route } = await import("./products.import.$batchId");
  return (Route as any).options.server.handlers.GET({
    request: detailRequest(),
    params: { batchId: BATCH_ID },
  });
}

function committedBatch() {
  return {
    id: BATCH_ID,
    user_id: VIEWER_ID, // the batch's own importer - viewer is allowed to see it
    status: "committed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    filename: "test.csv",
    total_rows: 2,
    imported_by_name: "Viewer",
    import_mode: "upsert",
    imported_count: 0,
    updated_count: 2,
    overwrite_fields: null,
    snapshot: [
      { id: PRODUCT_OWN_ID, action: "update", rowNum: 2, prevValues: { name: "Old Own Name" } },
      {
        id: PRODUCT_COLLEAGUE_ID,
        action: "update",
        rowNum: 3,
        prevValues: { name: "Old Colleague Name" },
      },
    ],
  };
}

describe("Import History detail panel — cross-user products stay visible", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the live state of a product created by a different account than the viewer, not just the viewer's own rows", async () => {
    const sb = makeSb();
    (supabaseAdmin.from as any).mockImplementation(sb.from);
    authAsUser(VIEWER_ID);

    sb.queue("product_import_batches", { data: committedBatch(), error: null });
    // resolveImportBatchScope's user_roles lookup - the viewer owns this batch
    sb.queue("user_roles", { data: [], error: null });
    // The shared catalog contains both products regardless of who created
    // them - a real "authenticated users can view all products" RLS-backed
    // query would return both rows for either viewer.
    sb.queue("products", {
      data: [
        {
          id: PRODUCT_OWN_ID,
          name: "New Own Name",
          sku: "SKU-OWN",
          price: 10,
          category: "Groceries",
        },
        {
          id: PRODUCT_COLLEAGUE_ID,
          name: "New Colleague Name",
          sku: "SKU-COLLEAGUE",
          price: 20,
          category: "Beverages",
        },
      ],
      error: null,
    });

    const response = await callDetail();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.liveProducts).toHaveLength(2);
    expect(body.liveProducts.map((p: any) => p.id)).toEqual(
      expect.arrayContaining([PRODUCT_OWN_ID, PRODUCT_COLLEAGUE_ID]),
    );
    const colleagueRow = body.liveProducts.find((p: any) => p.id === PRODUCT_COLLEAGUE_ID);
    expect(colleagueRow.name).toBe("New Colleague Name");

    // Regression guard: the products query issues no user_id filter at all.
    const productsCall = sb.callsFor("products", 0);
    const eqFilters = productsCall.filter((c) => c.method === "eq");
    expect(eqFilters.some((c) => c.args[0] === "user_id")).toBe(false);
  });
});
