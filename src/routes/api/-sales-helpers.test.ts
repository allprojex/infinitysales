import { describe, expect, it } from "vitest";
import { calculatePromotionDiscount, normalizeSaleItems, saleSubtotal } from "./-sales-helpers";

describe("sales promotion helpers", () => {
  const productId = "10590cf1-9176-4c3a-a4a0-0dd370a140b2";

  it("applies a product-specific percentage promotion when quantity threshold is met", () => {
    const items = normalizeSaleItems([
      { productId, productName: "QA Arizona Drink", quantity: 20, unitPrice: 10 },
    ]);
    const discount = calculatePromotionDiscount(
      [
        {
          id: "promo",
          type: "percentage",
          value: 10,
          min_purchase: 200,
          is_active: true,
          applies_to: {
            scope: "product",
            targetProductIds: [productId],
            buyQuantity: 20,
            status: "active",
          },
        },
      ],
      items,
      new Date("2026-06-22T12:00:00Z"),
    );

    expect(saleSubtotal(items)).toBe(200);
    expect(discount).toBe(20);
  });

  it("does not apply a promotion below the quantity threshold", () => {
    const items = normalizeSaleItems([
      { productId, productName: "QA Arizona Drink", quantity: 19, unitPrice: 10 },
    ]);
    const discount = calculatePromotionDiscount(
      [
        {
          id: "promo",
          type: "percentage",
          value: 10,
          min_purchase: 0,
          is_active: true,
          applies_to: {
            scope: "product",
            targetProductIds: [productId],
            buyQuantity: 20,
            status: "active",
          },
        },
      ],
      items,
      new Date("2026-06-22T12:00:00Z"),
    );

    expect(discount).toBe(0);
  });
});
