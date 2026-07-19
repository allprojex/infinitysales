// Server-only audit logging helper.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditEntry = {
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  status?: "success" | "failure";
  details?: Record<string, any> | null;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: entry.actorId ?? null,
      actor_name: entry.actorName ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_name: entry.entityName ?? null,
      status: entry.status ?? "success",
      details: entry.details ?? null,
    } as any);
  } catch (e) {
    console.error("[audit] failed to record", e);
  }
}

export async function actorFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: any;
}) {
  const meta = user.user_metadata ?? {};
  let name: string | null = meta.name ?? null;
  if (!name) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name,email")
      .eq("auth_id", user.id)
      .maybeSingle();
    name = profile?.name ?? (user.email ? user.email.split("@")[0] : null);
  }
  return { actorId: user.id, actorName: name, actorEmail: user.email ?? null };
}
