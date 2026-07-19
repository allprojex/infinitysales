import { test, expect, Page } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";
import { readNumber } from "./helpers/totals";

/** Issue a fetch from within the browser context, using the signed-in
 * session's accessToken (same token the app uses). Returns parsed JSON. */
async function apiFetch<T = unknown>(page: Page, path: string, init?: RequestInit): Promise<T> {
  return page.evaluate(
    async ({ path, init }) => {
      const token = localStorage.getItem("accessToken");
      const headers = new Headers(init?.headers as HeadersInit);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (init?.body && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      const res = await fetch(path, { ...init, headers });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
      try {
        return JSON.parse(text);
      } catch {
        return text as unknown;
      }
    },
    { path, init: init as any },
  );
}

async function pickProduct(page: Page): Promise<{ id: string | number; price: number } | null> {
  try {
    const list = await apiFetch<{ data?: Array<{ id: string | number; price?: number }> }>(
      page,
      "/api/products?limit=1",
    );
    const product = list?.data?.[0];
    return product ? { id: product.id, price: Number(product.price ?? 0) } : null;
  } catch {
    return null;
  }
}

async function postCashSale(page: Page, product: { id: string | number; price: number }) {
  const reference = `E2E-POS-LIVE-${Date.now()}`;
  return apiFetch(page, "/api/sales", {
    method: "POST",
    body: JSON.stringify({
      reference,
      items: [{ productId: product.id, quantity: 1, price: product.price }],
      subtotal: product.price,
      total: product.price,
      tax: 0,
      status: "completed",
      channel: "pos",
      payment_method: "cash",
    }),
  });
}

async function liveCashTotal(page: Page): Promise<number> {
  return readNumber(page.locator('[data-testid="pos-today-cash-value"]'));
}

function runLiveUpdateTest(role: "admin" | "user") {
  test(`${role}: 'Today's cash' KPI updates live after a new POS sale (no refresh)`, async ({
    page,
  }) => {
    const creds = getCreds(role);
    test.skip(
      !creds,
      `Set E2E_${role.toUpperCase()}_EMAIL / E2E_${role.toUpperCase()}_PASSWORD to run.`,
    );
    await signIn(page, creds!);
    await page.goto("/pos");

    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    // Wait until the initial KPI fetch resolves (scope flips off "loading").
    await expect(kpi).not.toHaveAttribute("data-scope", "loading", { timeout: 15_000 });

    const product = await pickProduct(page);
    test.skip(
      product == null || product.price <= 0,
      `No priced product available for the ${role} account to post a test sale.`,
    );

    const before = await liveCashTotal(page);
    const urlBefore = page.url();

    // Create a sale through the same API the POS uses. The realtime sync
    // hook listens to postgres_changes on `sales` and invalidates the
    // /api/reports/* query keys — the KPI must refresh on its own.
    let sale: { total?: number; id?: string } | null = null;
    try {
      sale = await postCashSale(page, product!);
      const saleTotal = Number(sale?.total ?? 0);

      // Poll for the KPI to reflect the new sale, with a generous bound.
      await expect
        .poll(() => liveCashTotal(page), {
          message: "Today's cash KPI did not update live after the new sale",
          timeout: 20_000,
          intervals: [500, 1000, 1500, 2000],
        })
        .toBeGreaterThan(before);

      const after = await liveCashTotal(page);
      expect(Math.abs(after - before - saleTotal)).toBeLessThanOrEqual(0.02);

      // Hard assertion: no full-page navigation happened.
      expect(page.url()).toBe(urlBefore);
    } finally {
      if (sale?.id) await apiFetch(page, `/api/sales/${sale.id}`, { method: "DELETE" });
    }
  });
}

test.describe("POS Today's cash KPI — live realtime update", () => {
  runLiveUpdateTest("admin");
  runLiveUpdateTest("user");
});
