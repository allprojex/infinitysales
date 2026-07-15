import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ensureDefaultAdmin, errorJson, json, loadUserShape } from "../_auth-helpers";
import { loginPortalAccessError, parseLoginPortal } from "../-auth-role-helpers";

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

        const user = await loadUserShape(data.user.id, data.user.email ?? email);
        if (user.isLocked) {
          return errorJson(403, "Account is locked. Contact an administrator.");
        }
        const portalError = loginPortalAccessError(user.role, portal);
        if (portalError) {
          return errorJson(403, portalError);
        }

        return json({
          requiresTwoFactor: false,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user,
        });
      },
    },
  },
});
