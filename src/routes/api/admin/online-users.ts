import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/admin/online-users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authUser = await getBearerUser(request);
        if (!authUser) return errorJson(401, "Unauthorized");

        // Admin check
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", authUser.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleRow) return errorJson(403, "Admin access required");

        const thresholdMinutes = 5;
        const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

        // Purge stale rows first so realtime sees the deletes too
        await supabaseAdmin.from("user_sessions").delete().lt("last_seen", cutoff);

        const { data, error } = await supabaseAdmin
          .from("user_sessions")
          .select("id,user_id,profile_name,email,role,login_at,last_seen,ip,user_agent")
          .gte("last_seen", cutoff)
          .order("login_at", { ascending: false });

        if (error) return errorJson(500, error.message);

        const users = (data ?? []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          userName: r.profile_name ?? r.email ?? "User",
          email: r.email,
          role: r.role ?? "user",
          loginAt: r.login_at,
          lastSeen: r.last_seen,
          ipAddress: r.ip,
          userAgent: r.user_agent,
        }));

        return json({ users, count: users.length, thresholdMinutes });
      },
    },
  },
});
