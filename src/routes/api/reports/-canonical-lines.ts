import { sb } from "./_helpers";

const ID_CHUNK = 200;
const PAGE_SIZE = 1000;

/** Loads every canonical line for a known, already-authorized set of sales. */
export async function loadCanonicalSaleLines(saleIds: string[], columns = "*") {
  const rows: Record<string, any>[] = [];
  for (let offset = 0; offset < saleIds.length; offset += ID_CHUNK) {
    const ids = saleIds.slice(offset, offset + ID_CHUNK);
    for (let page = 0; ; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await (sb as any)
        .from("sale_lines")
        .select(columns)
        .in("sale_id", ids)
        .order("line_number", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { lines: [], error: error.message as string };
      const batch = (data ?? []) as Record<string, any>[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
  }
  return { lines: rows, error: null as string | null };
}

export function groupCanonicalLines(lines: Record<string, any>[]) {
  const grouped = new Map<string, Record<string, any>[]>();
  for (const line of lines) {
    const saleId = String(line.sale_id ?? "");
    if (!saleId) continue;
    const group = grouped.get(saleId) ?? [];
    group.push(line);
    grouped.set(saleId, group);
  }
  return grouped;
}

export function canonicalLineDto(line: Record<string, any>) {
  return {
    id: line.id,
    lineId: line.id,
    lineNumber: line.line_number,
    productId: line.product_id,
    productName: line.product_name,
    name: line.product_name,
    sku: line.sku,
    barcode: line.barcode,
    categoryId: line.category_id,
    categoryName: line.category_name,
    category: line.category_name,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    price: line.unit_price,
    unitCost: line.unit_cost,
    cost: line.unit_cost,
    grossAmount: line.gross_amount,
    subtotal: line.gross_amount,
    discountAmount: line.discount_amount,
    taxAmount: line.tax_amount,
    total: line.total_amount,
    cogsAmount: line.cogs_amount,
    branchId: line.branch_id,
    warehouseId: line.warehouse_id,
    soldAt: line.sold_at,
    batchNumber: line.batch_number,
    expiryDate: line.expiry_date,
    serialNumbers: line.serial_numbers,
    promotionSnapshot: line.promotion_snapshot,
    pricingSnapshot: line.pricing_snapshot,
    knownFields: line.known_fields,
    snapshotCompleteness: line.snapshot_completeness,
  };
}
