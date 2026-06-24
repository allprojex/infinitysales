import { expect, Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { Creds, getCreds } from "./helpers/auth";

type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
};

type UploadFile = {
  field: string;
  name: string;
  type: string;
  bytes: number[];
};

async function workbookBytes(rows: Array<Array<string | number>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import");
  rows.forEach((row) => ws.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return Array.from(new Uint8Array(buffer as ArrayBuffer));
}

function csvBytes(csv: string) {
  return Array.from(new TextEncoder().encode(csv));
}

async function apiJson<T = unknown>(
  page: Page,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = localStorage.getItem("accessToken") ?? "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // keep raw text response
      }
      return { ok: res.ok, status: res.status, body: parsed };
    },
    { method, path, body },
  ) as Promise<ApiResult<T>>;
}

async function apiUpload<T = unknown>(
  page: Page,
  path: string,
  files: UploadFile[],
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, files }) => {
      const token = localStorage.getItem("accessToken") ?? "";
      const form = new FormData();
      for (const file of files) {
        form.append(
          file.field,
          new File([new Uint8Array(file.bytes)], file.name, { type: file.type }),
        );
      }
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(path, { method: "POST", headers, body: form });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // keep raw text response
      }
      return { ok: res.ok, status: res.status, body: parsed };
    },
    { path, files },
  ) as Promise<ApiResult<T>>;
}

async function deleteBySearch(page: Page, listPath: string, deletePath: string, search: string) {
  const listed = await apiJson<{ data?: Array<{ id: string | number }> }>(
    page,
    "GET",
    `${listPath}?search=${encodeURIComponent(search)}&limit=25`,
  );
  const rows = listed.ok && Array.isArray(listed.body?.data) ? listed.body.data : [];
  for (const row of rows) {
    await apiJson(page, "DELETE", `${deletePath}/${row.id}`);
  }
  return rows.length;
}

async function authenticateForApiSmoke(page: Page, creds: Creds) {
  await page.goto("/api/healthz");
  const result = await page.evaluate(async ({ email, password }) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
        screenRes: `${window.screen.width}x${window.screen.height}`,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.accessToken) {
      localStorage.setItem("accessToken", body.accessToken);
      if (body.refreshToken) localStorage.setItem("refreshToken", body.refreshToken);
    }
    return {
      ok: res.ok,
      status: res.status,
      hasAccessToken: Boolean(body.accessToken),
      role: body.user?.role ?? null,
      message: body.message ?? null,
    };
  }, creds);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.hasAccessToken).toBe(true);
}

test.describe("spreadsheet import security smoke", () => {
  test("valid CSV/XLSX imports work and invalid uploads are rejected", async ({ page }) => {
    const admin = getCreds("admin");
    test.skip(!admin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run import smoke tests.");

    const stamp = Date.now();
    const productSku = `QA-XLSX-${stamp}`;
    const productName = `QA Import Product ${stamp}`;
    const productFile = `qa-product-${stamp}.xlsx`;
    const saleRef = `QA-XLSX-SALE-${stamp}`;
    const purchaseRef = `QA-XLSX-PO-${stamp}`;
    const supplierName = `QA Import Supplier ${stamp}`;
    let productBatchId: string | null = null;

    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });

    await authenticateForApiSmoke(page, admin!);

    try {
      const template = await page.evaluate(async () => {
        const token = localStorage.getItem("accessToken") ?? "";
        const res = await fetch("/api/products/import-template?format=xlsx", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const bytes = await res.arrayBuffer();
        return {
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get("content-type") ?? "",
          byteLength: bytes.byteLength,
        };
      });
      expect(template.ok, `template status ${template.status}`).toBe(true);
      expect(template.contentType).toContain("spreadsheetml.sheet");
      expect(template.byteLength).toBeGreaterThan(1000);

      const badUpload = await apiUpload<{ message?: string }>(page, "/api/products/import/preview", [
        {
          field: "file",
          name: `qa-invalid-${stamp}.pdf`,
          type: "application/pdf",
          bytes: csvBytes("not a spreadsheet"),
        },
      ]);
      expect(badUpload.status).toBe(400);
      expect(String(badUpload.body?.message ?? "")).toContain("CSV or XLSX");

      const productRows = [
        [
          "name",
          "brand",
          "unit",
          "cost",
          "price",
          "stock",
          "reorder_point",
          "expiry_date",
          "batch_lot_number",
          "category",
          "sku",
          "barcode",
          "description",
        ],
        [
          productName,
          "QA",
          "pieces",
          "1.00",
          "2.00",
          "5",
          "1",
          "2026-12-31",
          `QA-BATCH-${stamp}`,
          "QA",
          productSku,
          "",
          "QA import smoke",
        ],
      ];
      const productPreview = await apiUpload<{
        batchId?: string;
        summary?: { ok: number; errors: number };
        rows?: Array<{ rowNum: number; status: string }>;
      }>(page, "/api/products/import/preview", [
        {
          field: "file",
          name: productFile,
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: await workbookBytes(productRows),
        },
      ]);
      expect(productPreview.ok, JSON.stringify(productPreview.body)).toBe(true);
      expect(productPreview.body?.summary?.ok).toBe(1);
      expect(productPreview.body?.summary?.errors).toBe(0);
      productBatchId = productPreview.body?.batchId ?? null;
      expect(productBatchId).toBeTruthy();

      const productCommit = await apiJson<{ importedCount?: number; errors?: string[] }>(
        page,
        "POST",
        "/api/products/import/commit",
        { batchId: productBatchId, selectedRowNums: [2], rowOverrides: {} },
      );
      expect(productCommit.ok, JSON.stringify(productCommit.body)).toBe(true);
      expect(productCommit.body?.importedCount).toBe(1);
      expect(productCommit.body?.errors ?? []).toHaveLength(0);

      const salesCsv = [
        "order_ref,customer_name,customer_email,product_name,quantity,unit_price,tax,status,date,notes",
        `${saleRef},QA Import Customer,qa-${stamp}@example.com,${productName},2,3.00,0,pending,2026-06-24,QA import smoke`,
      ].join("\n");
      const salesFile: UploadFile = {
        field: "files",
        name: `qa-sales-${stamp}.csv`,
        type: "text/csv",
        bytes: csvBytes(salesCsv),
      };
      const salesPreview = await apiUpload<{ totals?: { valid: number; errors: number } }>(
        page,
        "/api/import/sales/preview",
        [salesFile],
      );
      expect(salesPreview.ok, JSON.stringify(salesPreview.body)).toBe(true);
      expect(salesPreview.body?.totals?.valid).toBe(1);
      expect(salesPreview.body?.totals?.errors).toBe(0);
      const salesCommit = await apiUpload<{ imported?: number; errors?: string[] }>(
        page,
        "/api/import/sales",
        [salesFile],
      );
      expect(salesCommit.ok, JSON.stringify(salesCommit.body)).toBe(true);
      expect(salesCommit.body?.imported, JSON.stringify(salesCommit.body)).toBe(1);
      expect(salesCommit.body?.errors ?? []).toHaveLength(0);

      const purchaseCsv = [
        "order_ref,supplier,product_name,sku,quantity,unit_cost,expected_date,status,notes",
        `${purchaseRef},${supplierName},QA Import Purchase Item,QA-PO-${stamp},2,1.50,2026-06-30,ordered,QA import smoke`,
      ].join("\n");
      const purchaseFile: UploadFile = {
        field: "files",
        name: `qa-purchase-${stamp}.csv`,
        type: "text/csv",
        bytes: csvBytes(purchaseCsv),
      };
      const purchasePreview = await apiUpload<{ totals?: { valid: number; errors: number } }>(
        page,
        "/api/import/purchases/preview",
        [purchaseFile],
      );
      expect(purchasePreview.ok, JSON.stringify(purchasePreview.body)).toBe(true);
      expect(purchasePreview.body?.totals?.valid).toBe(1);
      expect(purchasePreview.body?.totals?.errors).toBe(0);
      const purchaseCommit = await apiUpload<{ imported?: number; errors?: string[] }>(
        page,
        "/api/import/purchases",
        [purchaseFile],
      );
      expect(purchaseCommit.ok, JSON.stringify(purchaseCommit.body)).toBe(true);
      expect(purchaseCommit.body?.imported, JSON.stringify(purchaseCommit.body)).toBe(1);
      expect(purchaseCommit.body?.errors ?? []).toHaveLength(0);

      const unexpectedConsoleErrors = consoleErrors.filter(
        (message) => !message.includes("Failed to load resource: the server responded with a status of 400"),
      );
      expect(requestFailures).toEqual([]);
      expect(unexpectedConsoleErrors).toEqual([]);
    } finally {
      await deleteBySearch(page, "/api/sales", "/api/sales", saleRef);
      await deleteBySearch(page, "/api/purchase-orders", "/api/purchase-orders", purchaseRef);
      await deleteBySearch(page, "/api/suppliers", "/api/suppliers", supplierName);
      if (productBatchId) {
        await apiJson(page, "DELETE", `/api/products/import/${productBatchId}/rollback`);
      }
    }
  });
});
