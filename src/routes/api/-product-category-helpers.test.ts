import { describe, expect, it } from "vitest";
import {
  categoryDeletionError,
  isDuplicateCategoryName,
  normalizeCategoryInput,
  validProductCategory,
} from "./-product-category-helpers";

describe("product category validation", () => {
  it("normalizes names and optional descriptions", () => {
    expect(normalizeCategoryInput({ name: "  Home   Care ", description: "  Useful  " })).toEqual({
      name: "Home Care",
      description: "Useful",
      isActive: true,
    });
  });

  it("detects duplicates without regard to casing", () => {
    expect(isDuplicateCategoryName(["Beverages"], "beVERages")).toBe(true);
    expect(isDuplicateCategoryName(["Beverages"], "Food Products")).toBe(false);
  });

  it("preserves explicit activation changes", () => {
    expect(normalizeCategoryInput({ name: "Beverages", isActive: false }).isActive).toBe(false);
  });

  it("blocks deletion while products use a category", () => {
    expect(categoryDeletionError(2)).toContain("assigned to 2 products");
    expect(categoryDeletionError(0)).toBeNull();
  });

  it("requires a valid active category for products", () => {
    expect(validProductCategory("category-id", true)).toBe(true);
    expect(validProductCategory("", true)).toBe(false);
    expect(validProductCategory("category-id", false)).toBe(false);
  });
});
