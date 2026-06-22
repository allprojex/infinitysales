/* eslint-disable @typescript-eslint/no-explicit-any */
import { errorJson, json, parseQuery, requireUser, safeJson, sb } from "./_resource-helpers";

type AnyRow = Record<string, any>;

type PromotionMeta = {
  scope?: string;
  targetCategory?: string | null;
  targetProductIds?: string[];
  description?: string | null;
  maxDiscountAmount?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  status?: string;
};

const VALID_STATUSES = new Set(["active", "paused", "draft"]);

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function intOrNull(value: unknown) {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function stringOrNull(value: unknown) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function dateOrNull(value: unknown) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  return raw;
}

function readMeta(appliesTo: unknown): PromotionMeta {
  if (!appliesTo || typeof appliesTo !== "object" || Array.isArray(appliesTo)) return {};
  return appliesTo as PromotionMeta;
}

function normalizeStatus(value: unknown, fallback = "active") {
  const status = stringOrNull(value)?.toLowerCase();
  return status && VALID_STATUSES.has(status) ? status : fallback;
}

export function promotionStatus(row: AnyRow, now = new Date()) {
  const meta = readMeta(row.applies_to);
  const endedAt = row.ends_at ? new Date(row.ends_at) : null;
  if (endedAt && Number.isFinite(endedAt.getTime()) && endedAt < now) return "expired";
  const explicit = normalizeStatus(meta.status, row.is_active === false ? "paused" : "active");
  if (explicit === "active" && row.is_active === false) return "paused";
  return explicit;
}

function dateInput(value: unknown) {
  const raw = stringOrNull(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function promotionRowToApi(row: AnyRow) {
  const meta = readMeta(row.applies_to);
  const minPurchase = numberOrZero(row.min_purchase);

  return {
    id: row.id,
    name: row.name,
    description: meta.description ?? null,
    type: row.type ?? "percentage",
    value: String(numberOrZero(row.value)),
    buyQuantity: intOrNull(meta.buyQuantity),
    getQuantity: intOrNull(meta.getQuantity),
    minOrderAmount: String(minPurchase),
    maxDiscountAmount:
      meta.maxDiscountAmount == null ? null : String(numberOrZero(meta.maxDiscountAmount)),
    startDate: dateInput(row.starts_at),
    endDate: dateInput(row.ends_at),
    status: promotionStatus(row),
    appliesTo: meta.scope ?? "all",
    targetCategory: meta.targetCategory ?? null,
    targetProductIds: Array.isArray(meta.targetProductIds) ? meta.targetProductIds : [],
    promoCode: row.code ?? null,
    usageCount: Number(row.used_count ?? 0),
    usageLimit: row.usage_limit ?? null,
    createdBy: row.user_id ?? null,
    createdAt: row.created_at,
  };
}

export function promotionBodyToRow(body: AnyRow, userId?: string) {
  const status = normalizeStatus(body.status, body.isActive === false ? "paused" : "active");
  const appliesTo = stringOrNull(body.appliesTo ?? body.applies_to) ?? "all";
  const targetProductIds = Array.isArray(body.targetProductIds)
    ? body.targetProductIds.map(String)
    : [];

  const meta: PromotionMeta = {
    scope: appliesTo,
    targetCategory: stringOrNull(body.targetCategory ?? body.target_category),
    targetProductIds,
    description: stringOrNull(body.description),
    maxDiscountAmount: numberOrNull(body.maxDiscountAmount ?? body.max_discount_amount),
    buyQuantity: intOrNull(body.buyQuantity ?? body.buy_quantity),
    getQuantity: intOrNull(body.getQuantity ?? body.get_quantity),
    status,
  };

  const row: AnyRow = {
    name: stringOrNull(body.name),
    code: stringOrNull(body.promoCode ?? body.promo_code ?? body.code)?.toUpperCase() ?? null,
    type: stringOrNull(body.type) ?? "percentage",
    value: numberOrZero(body.value),
    min_purchase: numberOrZero(body.minOrderAmount ?? body.min_purchase ?? body.minPurchase),
    starts_at: dateOrNull(body.startDate ?? body.starts_at ?? body.start_date),
    ends_at: dateOrNull(body.endDate ?? body.ends_at ?? body.end_date),
    usage_limit: intOrNull(body.usageLimit ?? body.usage_limit),
    is_active: status === "active",
    applies_to: meta,
  };

  if (userId) row.user_id = userId;
  return row;
}

export function promotionListCreateHandlers() {
  return {
    GET: async ({ request }: { request: Request }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const { limit, page, offset, search, params } = parseQuery(request);
      let q = sb
        .from("promotions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
      const type = params.get("type");
      if (type && type !== "all") q = q.eq("type", type);

      const { data, error } = await q;
      if (error) return errorJson(500, error.message);

      let mapped = (data ?? []).map((row) => promotionRowToApi(row as AnyRow));
      const status = params.get("status");
      if (status && status !== "all") mapped = mapped.filter((row) => row.status === status);

      return json({
        data: mapped.slice(offset, offset + limit),
        total: mapped.length,
        page,
        limit,
      });
    },
    POST: async ({ request }: { request: Request }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const body = await safeJson(request);
      const row = promotionBodyToRow(body, user.id);
      if (!row.name) return errorJson(400, "name is required");

      const { data, error } = await sb
        .from("promotions")
        .insert(row as never)
        .select("*")
        .single();
      if (error) return errorJson(500, error.message);
      return json(promotionRowToApi(data as AnyRow));
    },
  };
}

export function promotionItemHandlers() {
  return {
    GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const { data, error } = await sb
        .from("promotions")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", params.id)
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      return json(promotionRowToApi(data as AnyRow));
    },
    PUT: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const body = await safeJson(request);
      const row = promotionBodyToRow(body);
      delete row.name;
      if (stringOrNull(body.name)) row.name = stringOrNull(body.name);

      const { data, error } = await sb
        .from("promotions")
        .update(row as never)
        .eq("user_id", user.id)
        .eq("id", params.id)
        .select("*")
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      return json(promotionRowToApi(data as AnyRow));
    },
    DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const { data, error } = await sb
        .from("promotions")
        .delete()
        .eq("user_id", user.id)
        .eq("id", params.id)
        .select("id")
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      return json({ ok: true });
    },
  };
}

export function promotionStatusHandlers() {
  return {
    PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const body = await safeJson(request);
      const status = normalizeStatus(body.status, body.isActive === false ? "paused" : "active");

      const { data: existing, error: existingError } = await sb
        .from("promotions")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", params.id)
        .maybeSingle();
      if (existingError) return errorJson(500, existingError.message);
      if (!existing) return errorJson(404, "Not found");

      const meta = { ...readMeta((existing as AnyRow).applies_to), status };
      const { data, error } = await sb
        .from("promotions")
        .update({ is_active: status === "active", applies_to: meta } as never)
        .eq("user_id", user.id)
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return errorJson(500, error.message);
      return json(promotionRowToApi(data as AnyRow));
    },
  };
}

export function promotionStatsHandlers() {
  return {
    GET: async ({ request }: { request: Request }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;

      const { data, error } = await sb
        .from("promotions")
        .select("id,name,is_active,starts_at,ends_at,used_count,applies_to")
        .eq("user_id", user.id);
      if (error) return errorJson(500, error.message);

      const now = new Date();
      const rows = (data ?? []) as AnyRow[];
      const counts = { active: 0, paused: 0, expired: 0, draft: 0, upcoming: 0 };
      let totalUses = 0;

      for (const row of rows) {
        const status = promotionStatus(row, now);
        if (status in counts) counts[status as keyof typeof counts] += 1;
        const startsAt = row.starts_at ? new Date(row.starts_at) : null;
        if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt > now) counts.upcoming += 1;
        totalUses += Number(row.used_count ?? 0);
      }

      const topByUsage = [...rows]
        .sort((a, b) => Number(b.used_count ?? 0) - Number(a.used_count ?? 0))
        .filter((row) => Number(row.used_count ?? 0) > 0)
        .slice(0, 5)
        .map((row) => ({ name: row.name ?? "Promotion", usageCount: Number(row.used_count ?? 0) }));

      return json({ ...counts, totalUses, topByUsage });
    },
  };
}
