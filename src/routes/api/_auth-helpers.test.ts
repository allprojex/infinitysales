import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadUserShape } from "./_auth-helpers";

const AUTH_ID = "fd889ef3-b2b1-4597-b1b7-f7d85f990105";

function mockTables(opts: {
  profile?: { id: number; name: string; email: string } | null;
  roles?: Array<{ role: string }> | null;
  roleError?: { message: string; details?: string; hint?: string; code?: string } | null;
}) {
  // Mirrors real PostgREST behavior: on error, `data` comes back null, not [].
  const roleData = opts.roleError ? (opts.roles ?? null) : (opts.roles ?? []);
  const roleEq = vi.fn((_col: string, _val: string) =>
    Promise.resolve({ data: roleData, error: opts.roleError ?? null }),
  );
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.profile ?? null, error: null }),
      };
    }
    if (table === "user_roles") {
      // No `.in` on this fake builder: if loadUserShape ever calls `.in(...)` again
      // instead of `.eq(...)`, this throws "roleEq(...).in is not a function" —
      // a hard regression guard against ISSUE-009 recurring.
      return { select: vi.fn().mockReturnThis(), eq: roleEq };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { roleEq };
}

describe("loadUserShape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters user_roles by the auth uuid alone, never by profiles.id (regression for ISSUE-009)", async () => {
    // profile.id is a bigint (e.g. 3) — the exact shape that broke the old
    // .in([authId, "3"]) filter, which errors at the database with
    // "invalid input syntax for type uuid" whenever a non-uuid value is mixed in.
    const { roleEq } = mockTables({
      profile: { id: 3, name: "Hetty", email: "hetty@example.com" },
      roles: [{ role: "manager" }],
    });

    const result = await loadUserShape(AUTH_ID, "hetty@example.com");

    expect(roleEq).toHaveBeenCalledTimes(1);
    expect(roleEq).toHaveBeenCalledWith("user_id", AUTH_ID);
    expect(result.role).toBe("manager");
  });

  it("still resolves the role correctly when no profile row exists yet", async () => {
    const { roleEq } = mockTables({ profile: null, roles: [{ role: "user" }] });

    const result = await loadUserShape(AUTH_ID, "new@example.com");

    expect(roleEq).toHaveBeenCalledWith("user_id", AUTH_ID);
    expect(result.role).toBe("user");
  });

  it("falls back to fallbackRole without throwing when the role query errors", async () => {
    mockTables({
      profile: { id: 7, name: "X", email: "x@example.com" },
      roles: [],
      roleError: { message: "invalid input syntax for type uuid" },
    });

    const result = await loadUserShape(AUTH_ID, "x@example.com", "admin");

    expect(result.role).toBe("admin");
  });

  it("resolves safely (never rejects/throws) when the user_roles query errors with data: null and no fallback given", async () => {
    // Simulates the exact production failure mode: PostgREST returns
    // { data: null, error: {...} } for a malformed/rejected query, and the
    // caller (e.g. register.ts) passes no fallbackRole at all.
    mockTables({
      profile: { id: 11, name: "Z", email: "z@example.com" },
      roles: null,
      roleError: {
        message: "invalid input syntax for type uuid",
        code: "22P02",
      },
    });

    await expect(loadUserShape(AUTH_ID, "z@example.com")).resolves.toMatchObject({
      role: "user",
    });
  });

  it("picks the highest-priority role when multiple roles are assigned", async () => {
    mockTables({
      profile: { id: 9, name: "Y", email: "y@example.com" },
      roles: [{ role: "user" }, { role: "cashier" }, { role: "manager" }],
    });

    const result = await loadUserShape(AUTH_ID, "y@example.com");

    expect(result.role).toBe("manager");
  });
});
