// Server-only helper to require an admin caller for /api/auth/admin/* routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser } from "../_auth-helpers";

export async function requireAdmin(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return { user: null as null, response: errorJson(401, "Unauthorized") };
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) return { user: null as null, response: errorJson(403, "Admin access required") };
  return { user, response: null as null };
}
