import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ensureDefaultAdmin, errorJson, json, loadUserShape } from "../_auth-helpers";
import { loginPortalAccessError, parseLoginPortal, resolveLoginRole } from "../-auth-role-helpers";

function createRequestAuthClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase authentication environment variables");
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function authClearingErrorJson(status: number, message: string): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  for (const cookie of ["accessToken", "refreshToken", "sb-access-token", "sb-refresh-token"]) {
    headers.append("set-cookie", `${cookie}=; Max-Age=0; Path=/; SameSite=Lax; Secure`);
  }
  return new Response(JSON.stringify({ message }), { status, headers });
}

async function revokeCurrentSupabaseSession(
  authClient: ReturnType<typeof createRequestAuthClient>,
  accessToken: string,
) {
  const { error } = await authClient.auth.admin.signOut(accessToken, "local");
  if (error) {
    console.warn("[auth] failed to revoke rejected login session", error.message);
  }
}

async function loadResolvedLoginRole(
  authClient: ReturnType<typeof createRequestAuthClient>,
  authUserId: string,
) {
  const { data, error } = await authClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authUserId);
  return {
    error,
    role: resolveLoginRole(data?.map((row) => row.role)),
  };
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureDefaultAdmin();
        let body: { email?: string; password?: string; portal?: unknown };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON body");
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        const portal = parseLoginPortal(body.portal);
        if (!email || !password) return errorJson(400, "Email and password are required");

        const authClient = createRequestAuthClient();
        const { data, error } = await authClient.auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) {
          return errorJson(401, error?.message ?? "Invalid credentials");
        }

        const resolvedLoginRole = await loadResolvedLoginRole(authClient, data.user.id);
        if (resolvedLoginRole.error) {
          await revokeCurrentSupabaseSession(authClient, data.session.access_token);
          return authClearingErrorJson(500, resolvedLoginRole.error.message);
        }

        const loginRole = resolvedLoginRole.role;
        if (!loginRole) {
          await revokeCurrentSupabaseSession(authClient, data.session.access_token);
          return authClearingErrorJson(
            403,
            loginPortalAccessError(null, portal) ?? "Access denied",
          );
        }

        const portalError = loginPortalAccessError(loginRole, portal);
        if (portalError) {
          await revokeCurrentSupabaseSession(authClient, data.session.access_token);
          return authClearingErrorJson(403, portalError);
        }

        const user = await loadUserShape(data.user.id, data.user.email ?? email, loginRole);
        if (user.isLocked) {
          await revokeCurrentSupabaseSession(authClient, data.session.access_token);
          return authClearingErrorJson(403, "Account is locked. Contact an administrator.");
        }

        return json({
          requiresTwoFactor: false,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user: { ...user, role: loginRole },
        });
      },
    },
  },
});
