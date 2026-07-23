export type SaleLineDraft = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  promotionSnapshot: Record<string, unknown> | null;
  pricingSnapshot: Record<string, unknown>;
  batchNumber: string | null;
  expiryDate: string | null;
  serialNumbers: string[];
};

const MONEY_SCALE = 100;
const WEIGHT_SCALE = 1_000;

function scaled(value: number, scale: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
  const result = Math.round(value * scale);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} is too large`);
  return BigInt(result);
}

function cents(value: number, label: string) {
  return scaled(value, MONEY_SCALE, label);
}

function fromCents(value: bigint) {
  return Number(value) / MONEY_SCALE;
}

/** Allocate an exact currency total with cumulative half-up rounding. */
export function allocateSaleMoney(total: number, weights: readonly number[]) {
  const totalCents = cents(total, "total");
  const scaledWeights = weights.map((weight, index) =>
    scaled(weight, WEIGHT_SCALE, `weights[${index}]`),
  );
  const totalWeight = scaledWeights.reduce((sum, value) => sum + value, 0n);
  if (totalWeight <= 0n) {
    if (totalCents === 0n) return weights.map(() => 0);
    throw new RangeError("a positive allocation requires at least one positive weight");
  }

  let priorCumulative = 0n;
  let cumulativeWeight = 0n;
  return scaledWeights.map((weight, index) => {
    if (weight === 0n) return 0;
    cumulativeWeight += weight;
    const finalPositive = scaledWeights.slice(index + 1).every((next) => next === 0n);
    const numerator = totalCents * cumulativeWeight;
    const roundedCumulative = finalPositive
      ? totalCents
      : numerator / totalWeight + ((numerator % totalWeight) * 2n >= totalWeight ? 1n : 0n);
    const allocation = roundedCumulative - priorCumulative;
    priorCumulative = roundedCumulative;
    return fromCents(allocation);
  });
}

export type CanonicalLineSource = {
  productId: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  serialNumbers?: string[] | null;
};

export function buildCanonicalSaleLines(input: {
  items: readonly CanonicalLineSource[];
  discount: number;
  tax: number;
  promotionLineDiscounts?: readonly number[] | null;
  promotionSnapshot?: Record<string, unknown> | null;
  pricingSource: string;
}) {
  if (!input.items.length) throw new RangeError("at least one sale line is required");
  const quantities: number[] = [];
  const unitPrices: number[] = [];
  const gross = input.items.map((item, index) => {
    if (!item.productId) throw new RangeError(`items[${index}].productId is required`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new RangeError(`items[${index}].quantity must be greater than zero`);
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new RangeError(`items[${index}].unitPrice must be non-negative`);
    }
    const quantity = Number(item.quantity.toFixed(3));
    const unitPrice = Number(item.unitPrice.toFixed(2));
    if (quantity <= 0) throw new RangeError(`items[${index}].quantity rounds to zero`);
    quantities.push(quantity);
    unitPrices.push(unitPrice);
    return Number((quantity * unitPrice).toFixed(2));
  });

  let discounts: number[];
  if (input.promotionLineDiscounts) {
    if (input.promotionLineDiscounts.length !== input.items.length) {
      throw new RangeError("promotion line allocation length does not match sale lines");
    }
    const weights = input.promotionLineDiscounts.map((value, index) => {
      if (!Number.isFinite(value) || value < 0 || value > gross[index]!) {
        throw new RangeError(`promotionLineDiscounts[${index}] is invalid`);
      }
      return value;
    });
    discounts = allocateSaleMoney(input.discount, weights);
  } else {
    discounts = allocateSaleMoney(input.discount, gross);
  }
  discounts.forEach((discount, index) => {
    if (discount > gross[index]!) {
      throw new RangeError(`allocated discount exceeds gross amount for items[${index}]`);
    }
  });

  const netWeights = gross.map((amount, index) => Math.max(amount - discounts[index]!, 0));
  const taxes = allocateSaleMoney(
    input.tax,
    netWeights.some((value) => value > 0) ? netWeights : gross,
  );

  return input.items.map<SaleLineDraft>((item, index) => ({
    productId: item.productId,
    quantity: quantities[index]!,
    unitPrice: unitPrices[index]!,
    discountAmount: discounts[index]!,
    taxAmount: taxes[index]!,
    promotionSnapshot:
      input.promotionSnapshot && discounts[index]! > 0
        ? { ...input.promotionSnapshot, lineDiscountAmount: discounts[index] }
        : null,
    pricingSnapshot: {
      source: input.pricingSource,
      requestedUnitPrice: item.unitPrice,
      appliedUnitPrice: unitPrices[index],
      grossAmount: gross[index],
    },
    batchNumber: item.batchNumber ?? null,
    expiryDate: item.expiryDate ?? null,
    serialNumbers: [...(item.serialNumbers ?? [])],
  }));
}
