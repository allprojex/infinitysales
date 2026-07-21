// Client-side mirror of calculatePromotionDiscount() in
// src/routes/api/-sales-helpers.ts. That version is server-only (imports
// supabaseAdmin transitively, can't be bundled to the browser) and operates
// on raw DB rows; this one operates on the camelCase shape /api/promotions
// already returns (promotionRowToApi() in -promotion-helpers.ts), so pos.tsx
// can show the customer the *real* total -- including any auto-applied
// promotion -- before payment is collected, instead of charging one number
// and having create_sale_atomic silently record a different (discounted)
// one. Keep the discount math behaviorally identical to the server version
// if either changes.
export type PromotionForDiscount = {
  type?: string | null;
  value: string | number;
  minOrderAmount?: string | number | null;
  status: string; // "active" | "paused" | "expired" | "draft"
  appliesTo?: string | null;
  targetCategory?: string | null;
  targetProductIds?: string[] | null;
  buyQuantity?: number | null;
};

export type PromotionDiscountLineItem = {
  productId?: string | number | null;
  category?: string | null;
  quantity: number;
  total: number;
};

function normalizedDiscountType(value: unknown) {
  return String(value ?? "percentage")
    .toLowerCase()
    .replace(/[_ -]/g, "");
}

function promotionLineDiscount(
  promo: PromotionForDiscount,
  item: PromotionDiscountLineItem,
): number {
  const scope = String(promo.appliesTo ?? "all").toLowerCase();
  const productId = item.productId == null ? null : String(item.productId);
  const targetProductIds = (promo.targetProductIds ?? []).map(String);

  if (scope === "product" || scope === "products" || targetProductIds.length) {
    if (!productId || !targetProductIds.includes(productId)) return 0;
  }
  if (scope === "category" && promo.targetCategory) {
    if (String(item.category ?? "").toLowerCase() !== String(promo.targetCategory).toLowerCase())
      return 0;
  }

  const quantity = Number(item.quantity) || 0;
  const lineTotal = Number(item.total) || 0;
  const minQuantity = Number(promo.buyQuantity ?? 0) || 0;
  if (minQuantity > 0 && quantity < minQuantity) return 0;
  const minPurchase = Number(promo.minOrderAmount ?? 0) || 0;
  if (!minQuantity && minPurchase > 0 && lineTotal < minPurchase) return 0;

  const value = Number(promo.value) || 0;
  const type = normalizedDiscountType(promo.type);
  if (type === "percentage" || type === "percent" || type === "%off") {
    return lineTotal * (value / 100);
  }
  if (type === "fixed" || type === "fixedamount" || type === "amount") {
    return Math.min(value, lineTotal);
  }
  return 0;
}

export function calculatePromotionDiscount(
  promotions: PromotionForDiscount[],
  items: PromotionDiscountLineItem[],
): number {
  let bestDiscount = 0;
  for (const promotion of promotions) {
    if (promotion.status !== "active") continue;
    const discount = items.reduce((sum, item) => sum + promotionLineDiscount(promotion, item), 0);
    bestDiscount = Math.max(bestDiscount, discount);
  }
  return +bestDiscount.toFixed(2);
}
