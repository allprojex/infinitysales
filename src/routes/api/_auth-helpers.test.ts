import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("ensureDefaultAdmin", () => {
  const BOOT_EMAIL = "boot-admin@example.com";
  const BOOT_PASSWORD = "S3cure-Bootstrap-Pass!";

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function loadWithMocks(opts: {
    existingProfile?: { auth_id: string } | null;
    createUserResult?: { data: { user: { id: string } | null }; error: { message: string } | null };
  }) {
    vi.doMock("@/integrations/supabase/client.server", () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: opts.existingProfile ?? null, error: null }),
          };
        }
        if (table === "user_roles") {
          return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      });
      const createUser = vi
        .fn()
        .mockResolvedValue(
          opts.createUserResult ?? { data: { user: { id: "new-admin-id" } }, error: null },
        );
      return { supabaseAdmin: { from: fromMock, auth: { admin: { createUser } } } };
    });
    const mod = await import("./_auth-helpers");
    const { supabaseAdmin: mockedSupabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    return { ensureDefaultAdmin: mod.ensureDefaultAdmin, supabaseAdmin: mockedSupabaseAdmin };
  }

  it("contains no hardcoded bootstrap password literal in source (regression guard)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const source = await readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "_auth-helpers.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/Admin@123!/);
    expect(source).not.toMatch(/DEFAULT_ADMIN_PASSWORD\s*=\s*["']/);
  });

  it("creates no account and never touches the database when env vars are not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ensureDefaultAdmin, supabaseAdmin: mockedSupabaseAdmin } = await loadWithMocks({});

    await ensureDefaultAdmin();

    expect(mockedSupabaseAdmin.from).not.toHaveBeenCalled();
    expect(mockedSupabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(" ")).not.toMatch(/@/);
  });

  it("creates the configured admin when both env vars are set and no account exists yet", async () => {
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_EMAIL", BOOT_EMAIL);
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_PASSWORD", BOOT_PASSWORD);
    const { ensureDefaultAdmin, supabaseAdmin: mockedSupabaseAdmin } = await loadWithMocks({
      existingProfile: null,
    });

    await ensureDefaultAdmin();

    expect(mockedSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: BOOT_EMAIL,
        password: BOOT_PASSWORD,
        user_metadata: expect.objectContaining({ role: "admin", must_change_password: true }),
      }),
    );
  });

  it("never creates or modifies an account when the configured email already exists (idempotent)", async () => {
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_EMAIL", BOOT_EMAIL);
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_PASSWORD", BOOT_PASSWORD);
    const { ensureDefaultAdmin, supabaseAdmin: mockedSupabaseAdmin } = await loadWithMocks({
      existingProfile: { auth_id: "existing-auth-id" },
    });

    await ensureDefaultAdmin();

    expect(mockedSupabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("never logs the configured password or email in any console output, success or failure", async () => {
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_EMAIL", BOOT_EMAIL);
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_PASSWORD", BOOT_PASSWORD);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ensureDefaultAdmin } = await loadWithMocks({ existingProfile: null });

    await ensureDefaultAdmin();

    const allOutput = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(allOutput).not.toContain(BOOT_PASSWORD);
    expect(allOutput).not.toContain(BOOT_EMAIL);
  });

  it("sets must_change_password: true on a newly created bootstrap admin", async () => {
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_EMAIL", BOOT_EMAIL);
    vi.stubEnv("DEFAULT_ADMIN_BOOTSTRAP_PASSWORD", BOOT_PASSWORD);
    const { ensureDefaultAdmin, supabaseAdmin: mockedSupabaseAdmin } = await loadWithMocks({
      existingProfile: null,
    });

    await ensureDefaultAdmin();

    const call = (mockedSupabaseAdmin.auth.admin.createUser as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.user_metadata.must_change_password).toBe(true);
  });
});
