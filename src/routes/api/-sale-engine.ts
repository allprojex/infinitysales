import { apiToRow, sb } from "./_resource-helpers";
import { normalizeSaleBody } from "./-sales-helpers";

export type SaleEngineOptions = {
  applyPromotions?: boolean;
  sourceSystem?: "application" | "historical_import" | "smoke_test";
  effectsMode?: "post" | "historical_no_post";
  snapshotCompleteness?: "complete" | "catalog_at_import";
  pricingSource?: string;
};

function makeReference() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `INV-${stamp}`;
}

/** The only application entry point allowed to create a sale. */
export async function createSaleThroughEngine(
  actorId: string,
  rawBody: Record<string, unknown>,
  options: SaleEngineOptions = {},
) {
  const normalized = await normalizeSaleBody(actorId, rawBody, {
    applyPromotions: options.applyPromotions,
    pricingSource: options.pricingSource,
  });
  if (normalized.error) return { sale: null, body: normalized.body, error: normalized.error };

  const sourceSystem = options.sourceSystem ?? "application";
  const effectsMode = options.effectsMode ?? "post";
  const snapshotCompleteness = options.snapshotCompleteness ?? "complete";
  const body = normalized.body;
  const idempotencyKey = body.idempotencyKey ?? body.idempotency_key;
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return { sale: null, body, error: "A logical transaction idempotency key is required" };
  }
  const sale: Record<string, unknown> = {
    ...apiToRow(body),
    reference: body.reference ?? body.invoiceNumber ?? makeReference(),
    idempotency_key: idempotencyKey,
    source_system: sourceSystem,
    effects_mode: effectsMode,
    snapshot_completeness: snapshotCompleteness,
  };

  delete sale.items;

  const { data, error } = await (sb as any).rpc("create_sale_atomic", {
    p_actor: actorId,
    p_sale: sale,
    p_lines: normalized.lines,
  });
  return {
    sale: error ? null : data,
    body,
    error: error?.message ?? null,
  };
}
