import { Page, expect } from "@playwright/test";

export type Creds = { email: string; password: string };

export function getCreds(role: "admin" | "manager" | "user"): Creds | null {
  const envKey = role === "admin" ? "ADMIN" : role === "manager" ? "MANAGER" : "USER";
  const email = process.env[`E2E_${envKey}_EMAIL`];
  const password = process.env[`E2E_${envKey}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

/** Sign in via /login and wait for the post-login dashboard route. */
export async function signIn(page: Page, creds: Creds) {
  await page.goto("/login");
  // The login form uses name="identifier" + name="password" (see src/pages/login.tsx).
  await page.locator('input[name="identifier"]').fill(creds.email);
  await page.locator('input[name="password"]').fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  // Belt-and-braces: wait for any dashboard KPI to render.
  await expect(page.locator('[data-testid="kpi-total-revenue"]')).toBeVisible({ timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
  await page.context().clearPermissions();
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* noop */ }
  });
}
