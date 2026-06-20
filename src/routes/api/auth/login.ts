import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureDefaultAdmin, errorJson, json, loadUserShape } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureDefaultAdmin();
        let body: { email?: string; password?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON body");
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        if (!email || !password) return errorJson(400, "Email and password are required");

        const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) {
          return errorJson(401, error?.message ?? "Invalid credentials");
        }

        const user = await loadUserShape(data.user.id, data.user.email ?? email);
        if (user.isLocked) {
          return errorJson(403, "Account is locked. Contact an administrator.");
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
