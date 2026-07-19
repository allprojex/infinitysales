// Shared helpers for /api/auth/* server routes.
// Server-only — must not be imported from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "cashier" | "accountant" | "user";
  twoFactorEnabled: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export const ROLE_PRIORITY: ApiUser["role"][] = [
  "admin",
  "manager",
  "accountant",
  "cashier",
  "user",
];

export function pickHighestRole(
  roles: Array<string | null | undefined> | null | undefined,
): ApiUser["role"] {
  const assigned = new Set(roles ?? []);
  return ROLE_PRIORITY.find((role) => assigned.has(role)) ?? "user";
}

function normalizeRole(role: unknown): ApiUser["role"] | null {
  return typeof role === "string" && ROLE_PRIORITY.includes(role as ApiUser["role"])
    ? (role as ApiUser["role"])
    : null;
}

export function roleFromUserMetadata(user: { user_metadata?: Record<string, unknown> | null }) {
  return normalizeRole(user.user_metadata?.role);
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

export function errorJson(status: number, message: string): Response {
  return json({ message }, { status });
}

export async function loadUserShape(
  authUserId: string,
  email: string,
  fallbackRole?: ApiUser["role"] | null,
): Promise<ApiUser> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,name,email,is_locked,must_change_password,two_factor_enabled,created_at")
    .eq("auth_id", authUserId)
    .maybeSingle();

  let roleQuery = supabaseAdmin.from("user_roles").select("role").eq("user_id", authUserId);
  if (profile?.id != null) {
    roleQuery = supabaseAdmin
      .from("user_roles")
      .select("role")
      .in("user_id", [authUserId, String(profile.id)]);
  }
  const { data: roleRows } = await roleQuery;
  const role = pickHighestRole([...(roleRows?.map((r) => r.role) ?? []), fallbackRole]);

  return {
    id: Number(profile?.id ?? 0),
    name: profile?.name ?? email.split("@")[0],
    email: profile?.email ?? email,
    role,
    twoFactorEnabled: Boolean(profile?.two_factor_enabled ?? false),
    isLocked: Boolean(profile?.is_locked ?? false),
    mustChangePassword: Boolean(profile?.must_change_password ?? false),
    createdAt: profile?.created_at ?? new Date().toISOString(),
  };
}

export async function userHasRole(authUserId: string, role: ApiUser["role"]): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("auth_id", authUserId)
    .maybeSingle();
  const ids = [authUserId, profile?.id != null ? String(profile.id) : null].filter(
    (id): id is string => typeof id === "string",
  );
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .in("user_id", ids)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

export async function getBearerUser(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return userHasRole(userId, "admin");
}

// Idempotent bootstrap of the default admin account.
const DEFAULT_ADMIN_EMAIL = "admin@infinitysi.com";
const DEFAULT_ADMIN_PASSWORD = "Admin@123!";
let _seedRun = false;

export async function ensureDefaultAdmin(): Promise<void> {
  if (_seedRun) return;
  _seedRun = true;
  try {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("auth_id")
      .eq("email", DEFAULT_ADMIN_EMAIL)
      .maybeSingle();
    if (existing) return;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: "System Administrator",
        role: "admin",
        must_change_password: true,
      },
    });
    if (error || !created.user) {
      console.error("[bootstrap admin]", error);
      _seedRun = false; // allow retry
      return;
    }
    // Trigger should have inserted role; force admin role just in case.
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
  } catch (e) {
    console.error("[bootstrap admin] unexpected", e);
    _seedRun = false;
  }
}
