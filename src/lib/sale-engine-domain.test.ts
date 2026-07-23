import { describe, expect, it } from "vitest";
import { allocateSaleMoney, buildCanonicalSaleLines } from "./sale-engine-domain";

describe("canonical sale financial allocation", () => {
  it("allocates exact cents and puts the residual on the final weighted line", () => {
    expect(allocateSaleMoney(10, [1, 1, 1])).toEqual([3.33, 3.34, 3.33]);
    expect(allocateSaleMoney(0.05, [1, 1])).toEqual([0.03, 0.02]);
  });

  it("preserves duplicate products as financially distinct lines", () => {
    const lines = buildCanonicalSaleLines({
      items: [
        { productId: "same-product", quantity: 1, unitPrice: 10 },
        { productId: "same-product", quantity: 2, unitPrice: 7.5 },
      ],
      discount: 5,
      tax: 3,
      pricingSource: "manual",
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.unitPrice)).toEqual([10, 7.5]);
    expect(lines.reduce((sum, line) => sum + line.discountAmount, 0)).toBe(5);
    expect(lines.reduce((sum, line) => sum + line.taxAmount, 0)).toBe(3);
  });

  it("records the winning promotion on only affected lines", () => {
    const lines = buildCanonicalSaleLines({
      items: [
        { productId: "a", quantity: 1, unitPrice: 100 },
        { productId: "b", quantity: 1, unitPrice: 50 },
      ],
      discount: 10,
      tax: 0,
      promotionLineDiscounts: [10, 0],
      promotionSnapshot: { id: "promo-1", type: "percentage", value: 10 },
      pricingSource: "catalog_with_promotion",
    });

    expect(lines[0]!.promotionSnapshot).toMatchObject({ id: "promo-1", lineDiscountAmount: 10 });
    expect(lines[1]!.promotionSnapshot).toBeNull();
  });

  it("rejects malformed financial inputs", () => {
    expect(() =>
      buildCanonicalSaleLines({
        items: [{ productId: "a", quantity: 0, unitPrice: 1 }],
        discount: 0,
        tax: 0,
        pricingSource: "catalog",
      }),
    ).toThrow(/quantity/i);
    expect(() => allocateSaleMoney(1, [0, 0])).toThrow(/positive weight/i);
  });

  it("normalizes database precision before deriving money", () => {
    const [line] = buildCanonicalSaleLines({
      items: [{ productId: "p1", quantity: 1.2344, unitPrice: 2.345 }],
      discount: 0,
      tax: 0,
      pricingSource: "catalog",
    });
    expect(line).toMatchObject({ quantity: 1.234, unitPrice: 2.35 });
    expect(line?.pricingSnapshot).toMatchObject({
      requestedUnitPrice: 2.345,
      appliedUnitPrice: 2.35,
      grossAmount: 2.9,
    });
  });
});
