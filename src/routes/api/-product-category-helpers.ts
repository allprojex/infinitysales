export type CategoryInput = { name?: unknown; description?: unknown; isActive?: unknown };

export function normalizeCategoryInput(input: CategoryInput) {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const description =
    typeof input.description === "string" ? input.description.trim() || null : null;
  const isActive = typeof input.isActive === "boolean" ? input.isActive : true;
  return { name, description, isActive };
}

export function isDuplicateCategoryName(
  existingNames: string[],
  candidate: string,
  currentName?: string,
) {
  const normalized = candidate.trim().toLocaleLowerCase();
  const current = currentName?.trim().toLocaleLowerCase();
  return existingNames.some((name) => {
    const value = name.trim().toLocaleLowerCase();
    return value === normalized && value !== current;
  });
}

export function categoryDeletionError(productCount: number) {
  return productCount > 0
    ? `This category is assigned to ${productCount} product${productCount === 1 ? "" : "s"}. Reassign those products before deleting it.`
    : null;
}

export function validProductCategory(categoryId: unknown, isActive: unknown) {
  return typeof categoryId === "string" && categoryId.length > 0 && isActive === true;
}
