import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser, json, pickHighestRole } from "../_auth-helpers";

export const Route = createFileRoute("/api/sessions/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authUser = await getBearerUser(request);
        if (!authUser) return errorJson(401, "Unauthorized");

        // Pull display info
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("name,email")
          .eq("auth_id", authUser.id)
          .maybeSingle();

        const { data: roleRows } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", authUser.id);

        const ua = request.headers.get("user-agent") ?? null;
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          request.headers.get("cf-connecting-ip") ??
          null;

        // Find existing row to know whether to preserve login_at
        const { data: existing } = await supabaseAdmin
          .from("user_sessions")
          .select("login_at")
          .eq("user_id", authUser.id)
          .maybeSingle();

        const now = new Date().toISOString();
        const loginAt = existing?.login_at ?? now;

        const row = {
          user_id: authUser.id,
          profile_name: profile?.name ?? (authUser.email ? authUser.email.split("@")[0] : null),
          email: profile?.email ?? authUser.email ?? null,
          role: pickHighestRole(roleRows?.map((r) => r.role)),
          login_at: loginAt,
          last_seen: now,
          user_agent: ua,
          ip,
        };

        const { error } = await supabaseAdmin
          .from("user_sessions")
          .upsert(row as never, { onConflict: "user_id" });

        if (error) return errorJson(500, error.message);

        // Opportunistic cleanup of stale sessions (> 5 minutes)
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabaseAdmin.from("user_sessions").delete().lt("last_seen", cutoff);

        return json({ ok: true, loginAt });
      },
    },
  },
});
