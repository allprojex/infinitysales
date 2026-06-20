import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

export const Route = createFileRoute("/api/auth/admin/users/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const profileId = params.id;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("auth_id,email")
          .eq("id", profileId as any)
          .maybeSingle();
        if (!profile?.auth_id) return errorJson(404, "User not found");

        if (profile.auth_id === auth.user.id) return errorJson(400, "Cannot delete yourself");

        const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.auth_id);
        if (error) return errorJson(400, error.message);
        // Profiles will cascade via FK on delete.
        return json({ message: "User deleted" });
      },
    },
  },
});
