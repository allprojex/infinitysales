/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared helpers for /api/* resource routes (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBearerUser, json, errorJson } from "./_auth-helpers";
import { notify } from "./_notify";

export { json, errorJson };

export type NotifyConfig = {
  entity: string; // notification.type (e.g. "product", "sale")
  link?: string; // optional UI link prefix or absolute path
  label?: (row: any) => string; // human label for the row (defaults to name/reference/id)
  severity?: "info" | "success" | "warning" | "error";
};

function labelFor(row: any, cfg?: NotifyConfig): string {
  if (cfg?.label) {
    try {
      return cfg.label(row) || row?.id || "record";
    } catch {
      /* ignore */
    }
  }
  return row?.name ?? row?.reference ?? row?.title ?? row?.id ?? "record";
}

export async function requireUser(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return { user: null as null, response: errorJson(401, "Unauthorized") };
  return { user, response: null as null };
}

/** Require an authenticated user AND the `admin` role from public.user_roles. */
export async function requireAdmin(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth;
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return { user: null as null, response: errorJson(500, error.message) };
  if (!data) return { user: null as null, response: errorJson(403, "Admin access required") };
  return { user: auth.user, response: null as null };
}

/** Match the HRM UI gate: admins always pass; other users need perm_user_hrm=true. */
export async function requireHrmAccess(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth;

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (roleError) return { user: null as null, response: errorJson(500, roleError.message) };
  if ((roleRows ?? []).some((r: { role?: string | null }) => r.role === "admin")) {
    return { user: auth.user, response: null as null };
  }

  const { data, error } = await supabaseAdmin
    .from("user_settings")
    .select("data")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return { user: null as null, response: errorJson(500, error.message) };
  if (data?.data?.perm_user_hrm === "true" || data?.data?.perm_user_hrm === true) {
    return { user: auth.user, response: null as null };
  }
  return { user: null as null, response: errorJson(403, "HRM access required") };
}

export async function loadResourceScope(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) return { error: error.message, isPrivileged: false, scope: "own" as const };
  const roles = new Set((data ?? []).map((r: { role?: string }) => r.role));
  const isPrivileged = roles.has("admin") || roles.has("manager");
  return {
    error: null as string | null,
    isPrivileged,
    scope: isPrivileged ? ("all" as const) : ("own" as const),
  };
}

// snake_case <-> camelCase converters (shallow, sufficient for flat rows).
const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

export function rowToApi<T extends Record<string, any>>(row: T | null): any {
  if (!row) return row;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v;
  return out;
}

export function apiToRow<T extends Record<string, any>>(body: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id" || k === "createdAt" || k === "updatedAt" || k === "userId") continue;
    out[camelToSnake(k)] = v === "" ? null : v;
  }
  return out;
}

export async function safeJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function parseQuery(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const limit = Math.min(parseInt(q.get("limit") ?? "100", 10) || 100, 500);
  const page = Math.max(parseInt(q.get("page") ?? "1", 10) || 1, 1);
  const search = q.get("search") ?? "";
  return { limit, page, search, offset: (page - 1) * limit, params: q };
}

export const sb = supabaseAdmin;

type CrudOpts = {
  table: string;
  searchColumns?: string[];
  orderBy?: string;
  ascending?: boolean;
  required?: string[]; // body fields required on POST
  filters?: string[]; // query string keys to apply as eq() filters (camelCase -> snake_case)
  notify?: NotifyConfig; // when set, auto-emit a notification on POST success
  guard?: typeof requireUser;
};

/** List + create handlers for /api/<resource> */
export function listCreateHandlers(opts: CrudOpts) {
  const {
    table,
    searchColumns = ["name"],
    orderBy = "created_at",
    ascending = false,
    required = [],
    filters = [],
    notify: notifyCfg,
    guard,
  } = opts;
  return {
    GET: async ({ request }: { request: Request }) => {
      const { user, response } = await (guard ?? requireUser)(request);
      if (!user) return response;
      const { limit, page, offset, search, params } = parseQuery(request);
      let q = (sb as any)
        .from(table)
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order(orderBy, { ascending })
        .range(offset, offset + limit - 1);
      if (search && searchColumns.length) {
        const ors = searchColumns.map((c) => `${c}.ilike.%${search}%`).join(",");
        q = q.or(ors);
      }
      for (const f of filters) {
        const v = params.get(f);
        if (v != null && v !== "") {
          const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
          q = q.eq(col, v);
        }
      }
      const { data, error, count } = await q;
      if (error) return errorJson(500, error.message);
      return json({
        data: (data ?? []).map(rowToApi),
        total: count ?? data?.length ?? 0,
        page,
        limit,
      });
    },
    POST: async ({ request }: { request: Request }) => {
      const { user, response } = await (guard ?? requireUser)(request);
      if (!user) return response;
      const body = await safeJson(request);
      for (const r of required) {
        if (body?.[r] == null || body?.[r] === "") return errorJson(400, `${r} is required`);
      }
      const row = { ...apiToRow(body), user_id: user.id };
      const { data, error } = await (sb as any)
        .from(table)
        .insert(row as any)
        .select("*")
        .single();
      if (error) return errorJson(500, error.message);
      if (notifyCfg) {
        await notify({
          userId: user.id,
          type: notifyCfg.entity,
          severity: notifyCfg.severity ?? "info",
          title: `${notifyCfg.entity[0].toUpperCase()}${notifyCfg.entity.slice(1)} created`,
          message: labelFor(data, notifyCfg),
          link: notifyCfg.link ?? null,
          metadata: { id: data?.id, action: "create" },
        });
      }
      return json(rowToApi(data));
    },
  };
}

/** Get/update/delete handlers for /api/<resource>/$id (uuid PK) */
export function itemHandlers(opts: { table: string; notify?: NotifyConfig; guard?: typeof requireUser }) {
  const { table, notify: notifyCfg, guard } = opts;
  return {
    GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await (guard ?? requireUser)(request);
      if (!user) return response;
      const { data, error } = await (sb as any)
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .eq("id", params.id)
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      return json(rowToApi(data));
    },
    PUT: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await (guard ?? requireUser)(request);
      if (!user) return response;
      const body = await safeJson(request);
      const { data, error } = await (sb as any)
        .from(table)
        .update(apiToRow(body) as any)
        .eq("user_id", user.id)
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return errorJson(500, error.message);
      if (notifyCfg) {
        await notify({
          userId: user.id,
          type: notifyCfg.entity,
          severity: notifyCfg.severity ?? "info",
          title: `${notifyCfg.entity[0].toUpperCase()}${notifyCfg.entity.slice(1)} updated`,
          message: labelFor(data, notifyCfg),
          link: notifyCfg.link ?? null,
          metadata: { id: data?.id, action: "update" },
        });
      }
      return json(rowToApi(data));
    },
    DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await (guard ?? requireUser)(request);
      if (!user) return response;
      const { data: existing } = await (sb as any)
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .eq("id", params.id)
        .maybeSingle();
      const { error } = await (sb as any)
        .from(table)
        .delete()
        .eq("user_id", user.id)
        .eq("id", params.id);
      if (error) return errorJson(500, error.message);
      if (notifyCfg) {
        await notify({
          userId: user.id,
          type: notifyCfg.entity,
          severity: notifyCfg.severity ?? "warning",
          title: `${notifyCfg.entity[0].toUpperCase()}${notifyCfg.entity.slice(1)} deleted`,
          message: labelFor(existing ?? { id: params.id }, notifyCfg),
          link: notifyCfg.link ?? null,
          metadata: { id: params.id, action: "delete" },
        });
      }
      return json({ ok: true });
    },
  };
}
