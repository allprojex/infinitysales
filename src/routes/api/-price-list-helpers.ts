export function effectivePrice(type: string, discountValue: number, basePrice: number): number {
  if (type === "fixed_price") return discountValue;
  if (type === "fixed_discount") return Math.max(basePrice - discountValue, 0);
  // percentage_discount (default)
  return Math.max(basePrice * (1 - discountValue / 100), 0);
}
