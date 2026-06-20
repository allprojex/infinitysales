// Server-only notification helper.
// Inserts a row into the `notifications` table for the given user.
// Always swallows errors — a notification failure must never break the
// underlying business operation.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotifyEntry = {
  userId: string;
  type?: string; // domain category, e.g. "product", "sale", "cash"
  title: string;
  message?: string | null;
  link?: string | null;
  severity?: "info" | "success" | "warning" | "error";
  metadata?: Record<string, any> | null;
};

export async function notify(entry: NotifyEntry): Promise<void> {
  try {
    if (!entry.userId) return;
    await supabaseAdmin.from("notifications").insert({
      user_id: entry.userId,
      type: entry.type ?? "info",
      title: entry.title,
      message: entry.message ?? null,
      link: entry.link ?? null,
      severity: entry.severity ?? "info",
      metadata: entry.metadata ?? {},
    } as any);
  } catch (e) {
    console.error("[notify] failed to record", e);
  }
}
