import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

export const Route = createFileRoute("/api/auth/admin/set-lock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let body: { userId?: number | string; locked?: boolean };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }
        if (!body.userId) return errorJson(400, "userId required");
        if (typeof body.locked !== "boolean") return errorJson(400, "locked boolean required");

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("auth_id")
          .eq("id", body.userId as any)
          .maybeSingle();
        if (!profile?.auth_id) return errorJson(404, "User not found");
        if (profile.auth_id === auth.user.id && body.locked) return errorJson(400, "Cannot lock yourself");

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ is_locked: body.locked })
          .eq("auth_id", profile.auth_id);
        if (error) return errorJson(500, error.message);

        return json({ message: body.locked ? "User locked" : "User unlocked" });
      },
    },
  },
});
