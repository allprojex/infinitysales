import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }
        const email = (body.email ?? "").trim().toLowerCase();
        if (!email) return errorJson(400, "Email required");

        const origin = request.headers.get("origin") ?? new URL(request.url).origin;
        // Generic success response regardless of existence to avoid user enumeration.
        const successMessage = "If an account with that email exists, a reset link has been sent.";

        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password`,
        });
        if (error) {
          console.error("[forgot-password]", error);
        }
        return json({ message: successMessage });
      },
    },
  },
});
