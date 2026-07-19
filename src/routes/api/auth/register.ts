import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createRequestAuthClient, errorJson, json, loadUserShape } from "../_auth-helpers";

// Self-registration: creates a standard user account and immediately
// signs them in so they can access the POS Terminal right away.
export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { name?: string; email?: string; password?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON body");
        }
        const name = (body.name ?? "").trim();
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        if (!name) return errorJson(400, "Name is required");
        if (!email) return errorJson(400, "Email is required");
        if (password.length < 8) return errorJson(400, "Password must be at least 8 characters");

        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role: "user", must_change_password: false },
        });
        if (createErr || !created.user) {
          return errorJson(400, createErr?.message ?? "Failed to create account");
        }

        await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: created.user.id, role: "user" as any },
            { onConflict: "user_id,role" },
          );

        // Fresh, request-scoped client - see createRequestAuthClient for why
        // this must never be the shared supabaseAdmin singleton.
        const { data: signIn, error: signInErr } =
          await createRequestAuthClient().auth.signInWithPassword({ email, password });
        if (signInErr || !signIn.session || !signIn.user) {
          return errorJson(500, signInErr?.message ?? "Account created but sign-in failed");
        }

        const user = await loadUserShape(signIn.user.id, signIn.user.email ?? email);
        return json({
          requiresTwoFactor: false,
          accessToken: signIn.session.access_token,
          refreshToken: signIn.session.refresh_token,
          user,
        });
      },
    },
  },
});
