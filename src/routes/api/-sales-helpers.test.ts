import { describe, expect, it } from "vitest";
import {
  calculatePromotionDiscount,
  creditChargeAmount,
  normalizeSaleItems,
  saleSubtotal,
} from "./-sales-helpers";

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

describe("creditChargeAmount (ISSUE-008: feeds create_sale_atomic's p_credit_amount)", () => {
  it("charges the full total for a credit-method sale with nothing paid", () => {
    expect(creditChargeAmount({ paymentMethod: "credit", total: 150, paid: 0 })).toBe(150);
  });

  it("charges only the unpaid remainder for a partially-paid credit-method sale", () => {
    expect(creditChargeAmount({ paymentMethod: "store credit", total: 150, paid: 100 })).toBe(50);
  });

  it("charges the unpaid remainder for a paymentStatus of unpaid/partial/credit", () => {
    expect(creditChargeAmount({ paymentStatus: "unpaid", total: 80, paid: 0 })).toBe(80);
    expect(creditChargeAmount({ paymentStatus: "partial", total: 80, paid: 30 })).toBe(50);
    expect(creditChargeAmount({ paymentStatus: "credit", total: 80, paid: 20 })).toBe(60);
  });

  it("charges nothing for a fully-paid cash sale", () => {
    expect(
      creditChargeAmount({ paymentMethod: "cash", paymentStatus: "paid", total: 80, paid: 80 }),
    ).toBe(0);
  });

  it("never returns a negative amount when paid exceeds total", () => {
    expect(creditChargeAmount({ paymentStatus: "partial", total: 80, paid: 200 })).toBe(0);
  });

  it("charges nothing when no payment method/status signal is present", () => {
    expect(creditChargeAmount({ total: 80, paid: 0 })).toBe(0);
  });
});
