import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/products is the read path the POS's fetchFullProductCatalog loop
// (see src/lib/pos-catalog.ts) pages through. These tests pin down what the
// route-level POS-visibility investigation found: the query is already a
// shared catalog (no user_id filter at all - admin-created and staff-created
// products, imported or manual, all come back the same way), and it reports
// an accurate `total` so a paginating client can tell how many pages exist.

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CALLER_ID = "99999999-9999-9999-9999-999999999999";
const ADMIN_CREATOR = "11111111-1111-1111-1111-111111111111";
const STAFF_CREATOR = "22222222-2222-2222-2222-222222222222";

function authAsCaller() {
  (supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: CALLER_ID, email: "cashier@example.com", user_metadata: {} } },
    error: null,
  });
}

/** Records every chain call so tests can assert no .eq("user_id", ...) was
 *  ever applied, while still resolving with the canned { data, error, count }. */
function mockProductsTable(result: { data: unknown; error: unknown; count: number }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: any = {};
  for (const m of ["select", "eq", "or", "lte", "order", "range"]) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table !== "products") throw new Error(`unexpected table: ${table}`);
    return builder;
  });
  return calls;
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/products${query}`, {
    headers: { authorization: "Bearer test-token" },
  });
}

describe("GET /api/products — shared catalog, the POS's underlying read path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never filters by user_id — an admin-created and a staff-created product both come back in one response", async () => {
    authAsCaller();
    const calls = mockProductsTable({
      data: [
        { id: "p1", name: "Admin Product", user_id: ADMIN_CREATOR, sku: "SKU-1", barcode: "B1" },
        { id: "p2", name: "Staff Product", user_id: STAFF_CREATOR, sku: "SKU-2", barcode: "B2" },
      ],
      error: null,
      count: 2,
    });

    const { Route } = await import("./products");
    const response = await (Route as any).options.server.handlers.GET({
      request: getRequest("?limit=500&page=1"),
    });
    const body = await response.json();

    expect(body.data.map((p: any) => p.id)).toEqual(["p1", "p2"]);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(false);
  });

  it("returns a product with a blank SKU and blank barcode — neither is required for visibility", async () => {
    authAsCaller();
    mockProductsTable({
      data: [
        { id: "p3", name: "No-code product", user_id: STAFF_CREATOR, sku: null, barcode: null },
      ],
      error: null,
      count: 1,
    });

    const { Route } = await import("./products");
    const response = await (Route as any).options.server.handlers.GET({
      request: getRequest(),
    });
    const body = await response.json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0].sku).toBeNull();
    expect(body.data[0].barcode).toBeNull();
  });

  it("returns an accurate total for pages beyond the 500-row cap, so a paginating client knows to fetch page 2", async () => {
    authAsCaller();
    mockProductsTable({
      data: Array.from({ length: 500 }, (_, i) => ({ id: `p${i + 1}` })),
      error: null,
      count: 773, // real catalog size at the time this bug was diagnosed
    });

    const { Route } = await import("./products");
    const response = await (Route as any).options.server.handlers.GET({
      request: getRequest("?limit=500&page=1"),
    });
    const body = await response.json();

    expect(body.total).toBe(773);
    expect(body.data).toHaveLength(500);
    expect(Math.ceil(body.total / body.limit)).toBe(2); // a second page must be fetched
  });

  it("returns a product in a newly created category with no special-casing", async () => {
    authAsCaller();
    mockProductsTable({
      data: [
        {
          id: "p4",
          name: "New Category Product",
          user_id: STAFF_CREATOR,
          category_id: "brand-new-category-id",
          product_categories: { name: "Brand New Category", is_active: true },
        },
      ],
      error: null,
      count: 1,
    });

    const { Route } = await import("./products");
    const response = await (Route as any).options.server.handlers.GET({
      request: getRequest(),
    });
    const body = await response.json();

    expect(body.data[0].category).toBe("Brand New Category");
  });
});
