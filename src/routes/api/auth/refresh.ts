import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { refreshToken?: string };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }
        const refresh_token = body.refreshToken ?? "";
        if (!refresh_token) return errorJson(400, "Missing refreshToken");

        const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
        if (error || !data.session) return errorJson(401, error?.message ?? "Invalid refresh token");

        return json({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
      },
    },
  },
});
