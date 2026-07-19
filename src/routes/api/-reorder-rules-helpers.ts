import { errorJson, json, parseQuery, requireUser, safeJson, sb } from "./_resource-helpers";

type AnyRow = Record<string, any>;

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableId = (value: unknown) => {
  if (value == null || value === "" || value === "null") return null;
  return String(value);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * reorder_rules.supplier_id is a uuid column, but suppliers are keyed by a
 * legacy bigint `id` (see suppliers.uuid_id, added specifically to make this
 * resolvable - suppliers previously had no uuid form of their identity at
 * all, which made attaching a preferred supplier to a reorder rule
 * impossible: every attempt failed with "invalid input syntax for uuid").
 * Accepts either form so existing callers passing the numeric id keep working.
 */
async function resolveSupplierUuid(
  id: unknown,
): Promise<{ uuidId: string | null; error: string | null }> {
  const raw = nullableId(id);
  if (!raw) return { uuidId: null, error: null };
  const isUuid = UUID_RE.test(raw);
  const { data, error } = await sb
    .from("suppliers")
    .select("uuid_id")
    .eq(isUuid ? "uuid_id" : "id", (isUuid ? raw : Number(raw)) as never)
    .maybeSingle();
  if (error) return { uuidId: null, error: error.message };
  if (!data) return { uuidId: null, error: "Preferred supplier not found" };
  return { uuidId: (data as { uuid_id: string }).uuid_id, error: null };
}

async function mapRules(rows: AnyRow[]) {
  const productIds = Array.from(
    new Set(
      rows
        .map((row) => row.product_id)
        .filter(Boolean)
        .map(String),
    ),
  );
  const supplierIds = Array.from(
    new Set(
      rows
        .map((row) => row.supplier_id)
        .filter(Boolean)
        .map(String),
    ),
  );

  const [{ data: products }, { data: suppliers }] = await Promise.all([
    productIds.length
      ? sb
          .from("products")
          .select("id,name,sku,category,stock,price,reorder_level")
          .in("id", productIds as never)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? sb
          .from("suppliers")
          .select("id,uuid_id,name")
          .in("uuid_id", supplierIds as never)
      : Promise.resolve({ data: [] }),
  ]);

  const productMap = new Map(
    (products ?? []).map((product: AnyRow) => [String(product.id), product]),
  );
  const supplierMap = new Map(
    (suppliers ?? []).map((supplier: AnyRow) => [String(supplier.uuid_id), supplier]),
  );

  return rows.map((row) => {
    const product = productMap.get(String(row.product_id)) ?? {};
    const supplier = row.supplier_id ? supplierMap.get(String(row.supplier_id)) : null;
    const currentStock = numberValue(product.stock);
    const reorderPoint = numberValue(row.min_quantity ?? row.min_level ?? row.reorder_point);
    const reorderQty = numberValue(row.reorder_quantity ?? row.reorder_qty);

    return {
      id: row.id,
      product_id: row.product_id,
      product_name: product.name ?? "Unknown product",
      sku: product.sku ?? null,
      category: product.category ?? null,
      current_stock: currentStock,
      unit_price: product.price ?? "0",
      reorder_point: reorderPoint,
      reorder_qty: reorderQty,
      // Returned as the legacy bigint id, not the internally-stored uuid, so
      // it matches what the frontend's supplier <select> options use.
      preferred_supplier_id: supplier?.id ?? null,
      preferred_supplier_name: supplier?.name ?? null,
      is_active: row.is_active ?? true,
      auto_create_po: false,
      last_triggered: null,
      needs_reorder: currentStock <= reorderPoint,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

async function bodyToRow(
  body: AnyRow,
  userId?: string,
): Promise<{ row: AnyRow; error: string | null }> {
  const supplierRaw =
    body.preferredSupplierId ?? body.preferred_supplier_id ?? body.supplierId ?? body.supplier_id;
  const resolvedSupplier = await resolveSupplierUuid(supplierRaw);
  if (resolvedSupplier.error) return { row: {}, error: resolvedSupplier.error };

  const row: AnyRow = {
    product_id: nullableId(body.productId ?? body.product_id),
    min_quantity: numberValue(
      body.reorderPoint ?? body.reorder_point ?? body.minQuantity ?? body.min_quantity,
    ),
    reorder_quantity: numberValue(
      body.reorderQty ?? body.reorder_qty ?? body.reorderQuantity ?? body.reorder_quantity,
      1,
    ),
    supplier_id: resolvedSupplier.uuidId,
    is_active: body.isActive ?? body.is_active ?? true,
  };

  if (userId) row.user_id = userId;
  return { row, error: null };
}

export function reorderRuleListCreateHandlers() {
  return {
    GET: async ({ request }: { request: Request }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;
      const { limit, page, offset } = parseQuery(request);

      const { data, error, count } = await sb
        .from("reorder_rules")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return errorJson(500, error.message);

      return json({
        data: await mapRules((data ?? []) as AnyRow[]),
        total: count ?? data?.length ?? 0,
        page,
        limit,
      });
    },
    POST: async ({ request }: { request: Request }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;
      const body = await safeJson(request);
      const { row, error: supplierError } = await bodyToRow(body, user.id);
      if (supplierError) return errorJson(400, supplierError);
      if (!row.product_id) return errorJson(400, "productId is required");

      const { data, error } = await sb
        .from("reorder_rules")
        .insert(row as never)
        .select("*")
        .single();
      if (error) return errorJson(500, error.message);
      const [mapped] = await mapRules([data as AnyRow]);
      return json(mapped);
    },
  };
}

export function reorderRuleItemHandlers() {
  return {
    GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;
      const { data, error } = await sb
        .from("reorder_rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", params.id)
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      const [mapped] = await mapRules([data as AnyRow]);
      return json(mapped);
    },
    PUT: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;
      const body = await safeJson(request);
      const { row, error: supplierError } = await bodyToRow(body);
      if (supplierError) return errorJson(400, supplierError);
      delete row.product_id;

      const { data, error } = await sb
        .from("reorder_rules")
        .update(row as never)
        .eq("user_id", user.id)
        .eq("id", params.id)
        .select("*")
        .maybeSingle();
      if (error) return errorJson(500, error.message);
      if (!data) return errorJson(404, "Not found");
      const [mapped] = await mapRules([data as AnyRow]);
      return json(mapped);
    },
    DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
      const { user, response } = await requireUser(request);
      if (!user) return response;
      const { data, error } = await sb
        .from("reorder_rules")
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
