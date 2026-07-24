import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/sales is reachable from both the Sales page (perm_user_sales)
// and the POS terminal (perm_user_pos), each gated client-side only. These
// tests prove the server enforces one of those two permissions itself, so
// a user denied both in Admin Settings can't ring up a sale by calling the
// endpoint directly.

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
vi.mock("./-sale-engine", () => ({
  createSaleThroughEngine: vi.fn(async () => ({
    error: null,
    sale: { id: "sale-1", reference: "INV-1", total: 100, customer_id: null },
  })),
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CALLER_ID = "77777777-7777-7777-7777-777777777777";
const ADMIN_ID = "88888888-8888-8888-8888-888888888888";

function queryable(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
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

function authAsCaller() {
  (supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: CALLER_ID, email: "cashier@example.com", user_metadata: {} } },
    error: null,
  });
}

function postSaleRequest() {
  return new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ items: [] }),
  });
}

describe("POST /api/sales — server-side permission gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403s a user with neither perm_user_pos nor perm_user_sales", async () => {
    authAsCaller();
    mockTables({
      // requireAnyPermission's own admin check for the caller, and
      // globalUserPermissions' admin-id lookup, both read user_roles.
      user_roles: { data: [{ role: "cashier", user_id: ADMIN_ID }], error: null },
      user_settings: {
        data: [
          {
            data: { perm_user_pos: false, perm_user_sales: false },
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
    });

    const { Route } = await import("./sales");
    const response = await (Route as any).options.server.handlers.POST({
      request: postSaleRequest(),
    } as any);

    expect(response.status).toBe(403);
  });

  it("allows a user with perm_user_pos=true even though perm_user_sales=false", async () => {
    authAsCaller();
    mockTables({
      user_roles: { data: [{ role: "cashier", user_id: ADMIN_ID }], error: null },
      user_settings: {
        data: [
          {
            data: { perm_user_pos: true, perm_user_sales: false },
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
      notifications: { data: null, error: null },
    });

    const { Route } = await import("./sales");
    const response = await (Route as any).options.server.handlers.POST({
      request: postSaleRequest(),
    } as any);

    expect(response.status).toBe(200);
  });

  it("allows an admin regardless of the perm_user_pos/perm_user_sales settings", async () => {
    authAsCaller();
    mockTables({
      user_roles: { data: [{ role: "admin", user_id: CALLER_ID }], error: null },
      notifications: { data: null, error: null },
    });

    const { Route } = await import("./sales");
    const response = await (Route as any).options.server.handlers.POST({
      request: postSaleRequest(),
    } as any);

    expect(response.status).toBe(200);
  });

  it("defaults to allow when no admin has configured either permission (matches the client's defaultAllow=true gate)", async () => {
    authAsCaller();
    mockTables({
      user_roles: { data: [], error: null }, // caller has no role rows, and no admin ids exist yet
      notifications: { data: null, error: null },
    });

    const { Route } = await import("./sales");
    const response = await (Route as any).options.server.handlers.POST({
      request: postSaleRequest(),
    } as any);

    expect(response.status).toBe(200);
  });
});
