import { test, expect } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";

const managerCreds = getCreds("manager");

test.describe("Manager sees system-wide cash totals (dashboard + POS)", () => {
  test.skip(!managerCreds, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run.");

  test("dashboard: Total Revenue and Purchase Orders show 'All users' badge", async ({ page }) => {
    await signIn(page, managerCreds!);

    const revenueCard = page.locator('[data-testid="kpi-total-revenue"]');
    const poCard = page.locator('[data-testid="kpi-purchase-orders"]');

    await expect(revenueCard).toHaveAttribute("data-scope", "all");
    await expect(poCard).toHaveAttribute("data-scope", "all");
    await expect(revenueCard.getByText("All users")).toBeVisible();
    await expect(poCard.getByText("All users")).toBeVisible();
  });

  test("POS: Today's cash KPI shows 'All users' badge", async ({ page }) => {
    await signIn(page, managerCreds!);
    await page.goto("/pos");

    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    await expect(kpi).toHaveAttribute("data-scope", "all", { timeout: 15_000 });
    await expect(kpi.getByText("All users")).toBeVisible();
  });
});
