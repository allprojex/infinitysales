import { Locator } from "@playwright/test";

/** Parse a currency display like "GH₵ 1,234.50" or "₵1,234.50" into a number. */
export function parseCurrency(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export async function readNumber(loc: Locator): Promise<number> {
  await loc.waitFor({ state: "visible" });
  return parseCurrency(await loc.textContent());
}
