import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "./_resource-helpers";

// Canonical column order for the v2 template.
const COLUMNS = [
  "name", "brand", "unit", "cost", "price", "stock", "reorder_point",
  "expiry_date", "batch_lot_number", "category", "sku", "barcode", "description",
];

const SAMPLES: Record<string, string>[] = [
  {
    name: "Example Product",
    brand: "Acme",
    unit: "pcs",
    cost: "75.00",
    price: "99.99",
    stock: "10",
    reorder_point: "5",
    expiry_date: "2026-12-31",
    batch_lot_number: "BATCH-001",
    category: "General",
    sku: "SKU-001",
    barcode: "1234567890123",
    description: "Sample description",
  },
];

function toCsv(): string {
  const header = COLUMNS.join(",");
  const lines = SAMPLES.map((row) =>
    COLUMNS.map((c) => {
      const v = row[c] ?? "";
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

async function toXlsx(): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.addRow(COLUMNS);
  for (const row of SAMPLES) {
    ws.addRow(COLUMNS.map((c) => row[c] ?? ""));
  }
  return await wb.xlsx.writeBuffer() as unknown as Uint8Array;
}

export const Route = createFileRoute("/api/products/import-template")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const url = new URL(request.url);
        const format = (url.searchParams.get("format") || "csv").toLowerCase();

        if (format === "xlsx") {
          const buf = await toXlsx();
          return new Response(buf as unknown as ArrayBuffer, {
            headers: {
              "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "content-disposition": `attachment; filename="product-import-template-v2.xlsx"`,
            },
          });
        }


        return new Response(toCsv(), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="product-import-template-v2.csv"`,
          },
        });
      },
    },
  },
});
