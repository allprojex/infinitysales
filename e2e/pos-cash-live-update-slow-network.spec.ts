import { test, expect, Page } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";
import { readNumber } from "./helpers/totals";

/**
 * Verifies the POS "Today's cash" KPI eventually updates live (without a
 * manual refresh) even when the network is slow. We simulate latency by
 * delaying every /api/reports/* response — the realtime invalidation still
 * fires, but the refetch takes noticeably longer.
 */

const SLOW_MS = 2500;

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
    const list = await apiFetch<{
      data?: Array<{
        id: string | number;
        name?: string;
        price?: number;
        stock?: number;
      }>;
    }>(page, "/api/products?limit=100");
    const product = [...(list?.data ?? [])]
      .reverse()
      .find(
        (candidate) =>
          Number(candidate.price ?? 0) > 0 &&
          Number(candidate.stock ?? 0) > 0 &&
          !String(candidate.name ?? "").startsWith("Smoke Product "),
      );
    return product ? { id: product.id, price: Number(product.price ?? 0) } : null;
  } catch {
    return null;
  }
}

async function postCashSale(page: Page, product: { id: string | number; price: number }) {
  return apiFetch(page, "/api/sales", {
    method: "POST",
    body: JSON.stringify({
      reference: `E2E-POS-SLOW-${Date.now()}`,
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

function runSlowNetworkTest(role: "admin" | "user") {
  test(`${role}: KPI eventually updates live on slow network (no refresh)`, async ({ page }) => {
    const creds = getCreds(role);
    test.skip(
      !creds,
      `Set E2E_${role.toUpperCase()}_EMAIL / E2E_${role.toUpperCase()}_PASSWORD to run.`,
    );
    await signIn(page, creds!);
    await page.goto("/pos");

    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    await expect(kpi).not.toHaveAttribute("data-scope", "loading", { timeout: 20_000 });

    const product = await pickProduct(page);
    test.skip(
      product == null || product.price <= 0,
      `No priced product available for the ${role} account to post a test sale.`,
    );

    const before = await liveCashTotal(page);
    const urlBefore = page.url();

    // Throttle all KPI/report requests AFTER initial load so the refetch
    // triggered by the realtime invalidation is visibly slow.
    await page.route("**/api/reports/**", async (route) => {
      await new Promise((r) => setTimeout(r, SLOW_MS));
      try {
        await route.continue();
      } catch (error) {
        if (!String(error).includes("Route is already handled")) throw error;
      }
    });

    let sale: { total?: number; id?: string } | null = null;
    try {
      sale = await postCashSale(page, product!);
      const saleTotal = Number(sale?.total ?? 0);

      // Generous timeout to absorb the simulated latency + realtime fan-out.
      await expect
        .poll(() => liveCashTotal(page), {
          message: "Today's cash KPI did not update on slow network",
          timeout: 45_000,
          intervals: [1000, 2000, 3000],
        })
        .toBeGreaterThan(before);

      const after = await liveCashTotal(page);
      expect(Math.abs(after - before - saleTotal)).toBeLessThanOrEqual(0.02);

      // No full-page navigation should have occurred.
      expect(page.url()).toBe(urlBefore);
    } finally {
      await page.unrouteAll({ behavior: "wait" });
      if (sale?.id) await apiFetch(page, `/api/sales/${sale.id}`, { method: "DELETE" });
    }
  });
}

test.describe("POS Today's cash KPI — slow network live update", () => {
  runSlowNetworkTest("admin");
  runSlowNetworkTest("user");
});
