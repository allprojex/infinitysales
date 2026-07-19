// Server-only helpers for reading/writing keys inside the JSONB
// `data` column of public.user_settings (one row per user).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getUserSetting<T = unknown>(userId: string, key: string): Promise<T | null> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  return (blob[key] as T) ?? null;
}

export async function setUserSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("user_settings")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  const merged = { ...((existing?.data as Record<string, unknown>) ?? {}), ...patch };
  // Drop null values so callers can use `null` to delete keys.
  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
  await supabaseAdmin
    .from("user_settings")
    .upsert({ user_id: userId, data: merged as any }, { onConflict: "user_id" });
}
