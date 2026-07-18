import { describe, expect, it } from "vitest";
import { money, normalizeReturnItems, validateReturnItems } from "./-purchase-return-helpers";

describe("purchase return validation", () => {
  it("normalizes and accepts a partial return", () => {
    const items = normalizeReturnItems([
      { productId: "p1", quantityReturned: 2, reason: "Damaged", condition: "Damaged" },
    ]);
    expect(validateReturnItems(items)).toBeNull();
    expect(items[0].quantityReturned).toBe(2);
  });
  it("rejects zero and duplicate quantities", () => {
    expect(
      validateReturnItems(
        normalizeReturnItems([
          { productId: "p1", quantityReturned: 0, reason: "Damaged", condition: "Damaged" },
        ]),
      ),
    ).toMatch(/greater than zero/);
    expect(
      validateReturnItems(
        normalizeReturnItems([
          { productId: "p1", quantityReturned: 1, reason: "Damaged", condition: "Damaged" },
          { productId: "p1", quantityReturned: 1, reason: "Expired", condition: "Expired" },
        ]),
      ),
    ).toMatch(/unique/);
  });
  it("requires an explanation for Other and uses decimal-safe rounding", () => {
    expect(
      validateReturnItems(
        normalizeReturnItems([
          { productId: "p1", quantityReturned: 1, reason: "Other", condition: "Opened" },
        ]),
      ),
    ).toMatch(/Explain/);
    expect(money(10.005)).toBe(10.01);
  });
});
