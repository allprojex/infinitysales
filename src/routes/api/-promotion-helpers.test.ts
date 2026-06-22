import { describe, expect, it } from "vitest";
import { promotionBodyToRow, promotionRowToApi, promotionStatus } from "./-promotion-helpers";

describe("promotion mapping", () => {
  it("maps create payloads to the existing promotions schema", () => {
    const row = promotionBodyToRow(
      {
        name: "QA Promo",
        description: "Visible note",
        type: "percentage",
        value: "50",
        buyQuantity: "",
        getQuantity: "",
        minOrderAmount: "500",
        maxDiscountAmount: "",
        startDate: "2026-06-22",
        endDate: "2026-07-31",
        status: "draft",
        appliesTo: "all",
        targetCategory: "",
        promoCode: "save25",
        usageLimit: "",
      },
      "user-1",
    );

    expect(row).toMatchObject({
      user_id: "user-1",
      name: "QA Promo",
      code: "SAVE25",
      type: "percentage",
      value: 50,
      min_purchase: 500,
      starts_at: "2026-06-22",
      ends_at: "2026-07-31",
      usage_limit: null,
      is_active: false,
    });
    expect(row).not.toHaveProperty("buy_quantity");
    expect(row).not.toHaveProperty("get_quantity");
    expect(row).not.toHaveProperty("promo_code");
    expect(row).not.toHaveProperty("start_date");
    expect(row.applies_to).toMatchObject({
      scope: "all",
      description: "Visible note",
      status: "draft",
    });
  });

  it("maps database rows back to the UI promotion shape", () => {
    const api = promotionRowToApi({
      id: "promo-1",
      user_id: "user-1",
      name: "QA Promo",
      code: "SAVE25",
      type: "percentage",
      value: 50,
      min_purchase: 500,
      starts_at: "2026-06-22T00:00:00.000Z",
      ends_at: "2026-07-31T00:00:00.000Z",
      usage_limit: null,
      used_count: 2,
      is_active: false,
      applies_to: { scope: "all", description: "Visible note", status: "draft" },
      created_at: "2026-06-22T00:00:00.000Z",
    });

    expect(api).toMatchObject({
      id: "promo-1",
      promoCode: "SAVE25",
      minOrderAmount: "500",
      startDate: "2026-06-22",
      endDate: "2026-07-31",
      usageCount: 2,
      status: "draft",
      description: "Visible note",
    });
  });

  it("treats ended promotions as expired", () => {
    expect(
      promotionStatus(
        {
          is_active: true,
          ends_at: "2026-06-01T00:00:00.000Z",
          applies_to: { status: "active" },
        },
        new Date("2026-06-22T00:00:00.000Z"),
      ),
    ).toBe("expired");
  });
});
