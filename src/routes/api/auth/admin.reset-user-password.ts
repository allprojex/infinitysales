import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

export const Route = createFileRoute("/api/auth/admin/reset-user-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let body: { userId?: number | string; newPassword?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON");
        }
        if (!body.userId) return errorJson(400, "userId required");
        if (!body.newPassword || body.newPassword.length < 8)
          return errorJson(400, "Password too short");

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("auth_id")
          .eq("id", body.userId as any)
          .maybeSingle();
        if (!profile?.auth_id) return errorJson(404, "User not found");

        const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.auth_id, {
          password: body.newPassword,
        });
        if (error) return errorJson(400, error.message);

        await supabaseAdmin
          .from("profiles")
          .update({ must_change_password: true })
          .eq("auth_id", profile.auth_id);

        return json({ message: "Password reset" });
      },
    },
  },
});
