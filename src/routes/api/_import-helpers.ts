// Shared helpers for bulk-import endpoints.

const TEMPLATE_VERSION = 1;
export const ROLLBACK_WINDOW_HOURS = 24;

/** RFC4180-ish CSV parser that supports quoted fields and embedded commas/newlines. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); field = "";
        if (cur.some((v) => v.trim() !== "")) out.push(cur);
        cur = [];
      } else field += c;
    }
  }
  if (field !== "" || cur.length) { cur.push(field); if (cur.some((v) => v.trim() !== "")) out.push(cur); }
  if (out.length === 0) return { headers: [], rows: [] };
  const headers = out[0].map((h) => h.trim());
  const rows = out.slice(1).map((cells) => {
    const r: Record<string, string> = {};
    headers.forEach((h, idx) => { r[h] = (cells[idx] ?? "").trim(); });
    return r;
  });
  return { headers, rows };
}

export function isCsvFile(name: string): boolean {
  return /\.csv$/i.test(name);
}

export function isExcelFile(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name);
}

export { TEMPLATE_VERSION };

// ── Spreadsheet parser (CSV + XLSX) ──────────────────────────────────────────

/** Parse an uploaded CSV or XLSX file into headers + row maps. */
export async function parseSpreadsheet(
  file: File,
): Promise<{ headers: string[]; rows: Record<string, string>[]; fileWarnings: string[] }> {
  const fileWarnings: string[] = [];

  if (isCsvFile(file.name)) {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    return { headers, rows, fileWarnings };
  }

  if (isExcelFile(file.name)) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [], fileWarnings: ["Workbook has no sheets."] };
    if (wb.SheetNames.length > 1) {
      fileWarnings.push(`Workbook has ${wb.SheetNames.length} sheets — only the first ("${sheetName}") was read.`);
    }
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    if (!aoa.length) return { headers: [], rows: [], fileWarnings };
    const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const cells = aoa[i] ?? [];
      if (!cells.some((v) => String(v ?? "").trim() !== "")) continue;
      const r: Record<string, string> = {};
      headers.forEach((h, idx) => { r[h] = String(cells[idx] ?? "").trim(); });
      rows.push(r);
    }
    return { headers, rows, fileWarnings };
  }

  throw new Error(`Unsupported file type: ${file.name}. Use CSV or XLSX.`);
}


// ── Product import validation ──────────────────────────────────────────────────

export interface NormalizedProductRow {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  /** Selling price (maps to products.price). Optional. */
  price: string | null;
  /** Purchase / cost price (maps to products.cost). Optional. */
  cost: string | null;
  /** Legacy: retained for backwards compatibility with older preview batches. */
  sellingPrice: string | null;
  wholesalePrice: string | null;
  stock: number;
  unit: string | null;
  description: string | null;
  reorderPoint: number;
  imageUrl: string | null;
  supplier: string | null;
  taxInfo: string | null;
  expiryDate: string | null;
  batchLotNumber: string | null;
}

const numRe = /^\d+(\.\d{1,2})?$/;
const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

function pickRaw(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function validateMoney(label: string, raw: string, errors: string[]): boolean {
  if (raw.includes(",")) { errors.push(`${label} "${raw}" must not contain commas — use a plain decimal (e.g. 1500.00)`); return false; }
  if (!/^\d+(\.\d+)?$/.test(raw)) { errors.push(`${label} "${raw}" is not a valid number`); return false; }
  if (/\.\d{3,}/.test(raw)) { errors.push(`${label} "${raw}" has more than 2 decimal places`); return false; }
  if (parseFloat(raw) < 0) { errors.push(`${label} cannot be negative`); return false; }
  return true;
}

/** Normalise a date string. Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY (ambiguous → DD/MM/YYYY assumed), or Excel-style date strings. Returns ISO date or null. */
function normaliseDate(raw: string, label: string, warnings: string[]): string | null {
  if (!raw) return null;
  if (isoDateRe.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    let day = a, month = b;
    // If first part > 12, it must be day-first.
    if (parseInt(a, 10) > 12) { day = a; month = b; }
    else if (parseInt(b, 10) > 12) { day = b; month = a; }
    const yyyy = y.length === 2 ? `20${y}` : y;
    const iso = `${yyyy}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (isoDateRe.test(iso)) return iso;
  }
  warnings.push(`${label} "${raw}" is not a recognised date — saved as blank. Use YYYY-MM-DD.`);
  return null;
}

/** Validate a single raw spreadsheet row. Missing fields are allowed unless noted. */
export function validateProductRow(
  raw: Record<string, string>,
  rowNum: number,
): { data: NormalizedProductRow; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = pickRaw(raw, "name", "product_name", "Product Name", "Name");
  if (!name) errors.push("Product Name is required");

  // Selling price → products.price (optional)
  const sellingRaw = pickRaw(raw, "price", "selling_price", "Selling Price", "Unit Price", "unit_price");
  let priceOut: string | null = null;
  if (sellingRaw) {
    if (validateMoney("Selling Price", sellingRaw, errors)) priceOut = sellingRaw;
  }

  // Purchase price → products.cost (optional)
  const costRaw = pickRaw(raw, "cost", "purchase_price", "Purchase Price", "unit_cost", "Unit Cost");
  let costOut: string | null = null;
  if (costRaw) {
    if (validateMoney("Purchase Price", costRaw, errors)) costOut = costRaw;
  }

  if (!sellingRaw && !costRaw) warnings.push("No selling price or purchase price provided — saved as blank.");

  // Legacy fields (kept for older templates)
  const wholesaleRaw = pickRaw(raw, "wholesale_price", "Wholesale Price");
  if (wholesaleRaw) validateMoney("Wholesale Price", wholesaleRaw, errors);

  const stockRaw = pickRaw(raw, "stock", "stock_quantity", "Stock Quantity", "quantity", "Quantity");
  let stock = 0;
  if (stockRaw) {
    if (!/^\d+$/.test(stockRaw)) errors.push(`Stock Quantity "${stockRaw}" must be a whole number`);
    else stock = parseInt(stockRaw, 10);
  }

  const reorderRaw = pickRaw(raw, "reorder_point", "reorder_level", "Reorder Point", "Reorder Level");
  let reorderPoint = 0;
  if (reorderRaw) {
    if (!/^\d+$/.test(reorderRaw)) errors.push(`Reorder Point "${reorderRaw}" must be a whole number`);
    else reorderPoint = parseInt(reorderRaw, 10);
  }

  const sku = pickRaw(raw, "sku", "SKU") || null;
  const barcode = pickRaw(raw, "barcode", "qr", "Barcode", "Barcode / QR", "Barcode/QR", "QR") || null;
  if (!sku) warnings.push("No SKU provided — duplicate detection by SKU will be skipped for this row.");

  const expiryRaw = pickRaw(raw, "expiry_date", "Expiry Date", "expiry", "Expiry");
  const expiryDate = expiryRaw ? normaliseDate(expiryRaw, "Expiry Date", warnings) : null;

  const batchLot = pickRaw(raw, "batch_lot_number", "batch_number", "lot_number", "Batch", "Lot", "Batch / Lot Number", "Batch/Lot Number", "Batch Lot Number") || null;

  return {
    errors,
    warnings,
    data: {
      name,
      sku,
      barcode,
      category: pickRaw(raw, "category", "Category") || null,
      brand: pickRaw(raw, "brand", "Brand") || null,
      price: priceOut,
      cost: costOut,
      sellingPrice: null,
      wholesalePrice: wholesaleRaw || null,
      stock,
      unit: pickRaw(raw, "unit", "unit_of_measure", "Unit", "Unit of Measure", "uom", "UOM") || null,
      description: pickRaw(raw, "description", "Description") || null,
      reorderPoint,
      imageUrl: pickRaw(raw, "image_url", "Image URL", "image") || null,
      supplier: pickRaw(raw, "supplier", "Supplier") || null,
      taxInfo: pickRaw(raw, "tax_info", "tax_rate", "Tax Info", "Tax Rate") || null,
      expiryDate,
      batchLotNumber: batchLot,
    },
  };
}

/** Convert a normalized row into a DB-ready insert payload. */
export function productRowToDbPayload(d: NormalizedProductRow, userId: string): Record<string, any> {
  const attributes: Record<string, any> = {};
  if (d.wholesalePrice) attributes.wholesale_price = parseFloat(d.wholesalePrice);
  if (d.supplier) attributes.supplier = d.supplier;

  const taxRate = d.taxInfo && /^\d+(\.\d+)?$/.test(d.taxInfo) ? parseFloat(d.taxInfo) : null;

  return {
    user_id: userId,
    name: d.name,
    sku: d.sku,
    barcode: d.barcode,
    category: d.category,
    brand: d.brand,
    description: d.description,
    unit: d.unit,
    price: d.price ? parseFloat(d.price) : null,
    cost: d.cost ? parseFloat(d.cost) : null,
    stock: d.stock,
    reorder_level: d.reorderPoint,
    image_url: d.imageUrl,
    tax_rate: taxRate,
    expiry_date: d.expiryDate,
    batch_lot_number: d.batchLotNumber,
    attributes: Object.keys(attributes).length ? attributes : null,
  };
}


// ── Purchase row validation ────────────────────────────────────────────────────

export interface NormalizedPurchaseRow {
  orderRef: string;
  supplierName: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  expectedDate: string | null;
  notes: string | null;
  status: string;
}

const intRe = /^\d+$/;
const moneyRe = /^\d+(\.\d{1,4})?$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function pick(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function validatePurchaseRow(
  raw: Record<string, string>,
  rowNum: number,
): { data: NormalizedPurchaseRow | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const orderRef = pick(raw, "order_ref", "reference", "Order Ref", "Reference", "PO");
  const supplier = pick(raw, "supplier", "supplier_name", "Supplier", "Supplier Name");
  const productName = pick(raw, "product_name", "name", "Product", "Product Name", "item");
  const sku = pick(raw, "sku", "SKU");
  const qtyRaw = pick(raw, "quantity", "qty", "Quantity", "Qty");
  const costRaw = pick(raw, "unit_cost", "cost", "price", "Unit Cost", "Cost", "Price");
  const expected = pick(raw, "expected_date", "Expected Date", "expected", "delivery_date");
  const notes = pick(raw, "notes", "Notes", "remarks");
  const status = pick(raw, "status", "Status").toLowerCase() || "draft";

  if (!orderRef) errors.push(`Row ${rowNum}: order_ref is required (groups items into one PO)`);
  if (!productName) errors.push(`Row ${rowNum}: product_name is required`);
  if (!supplier) warnings.push(`Row ${rowNum}: no supplier — will be created as "Unknown" or merged by ref`);

  let quantity = 0;
  if (!qtyRaw) errors.push(`Row ${rowNum}: quantity is required`);
  else if (!intRe.test(qtyRaw)) errors.push(`Row ${rowNum}: quantity "${qtyRaw}" must be a whole number`);
  else { quantity = parseInt(qtyRaw, 10); if (quantity <= 0) errors.push(`Row ${rowNum}: quantity must be greater than 0`); }

  let unitCost = 0;
  if (!costRaw) errors.push(`Row ${rowNum}: unit_cost is required`);
  else if (costRaw.includes(",")) errors.push(`Row ${rowNum}: unit_cost "${costRaw}" must not contain commas — use a plain decimal (e.g. 1500.00)`);
  else if (!moneyRe.test(costRaw)) errors.push(`Row ${rowNum}: unit_cost "${costRaw}" is not a valid number`);
  else unitCost = parseFloat(costRaw);

  if (expected && !dateRe.test(expected)) errors.push(`Row ${rowNum}: expected_date "${expected}" must be in YYYY-MM-DD format`);
  if (status && !["draft", "ordered", "pending", "received", "cancelled"].includes(status)) {
    warnings.push(`Row ${rowNum}: status "${status}" is unusual — expected draft, ordered, pending, received, cancelled`);
  }

  if (errors.length) return { data: null, errors, warnings };

  return {
    data: {
      orderRef,
      supplierName: supplier || null,
      productName,
      sku: sku || null,
      quantity,
      unitCost,
      lineTotal: +(quantity * unitCost).toFixed(2),
      expectedDate: expected || null,
      notes: notes || null,
      status,
    },
    errors,
    warnings,
  };
}

// ── Sales row validation ───────────────────────────────────────────────────────

export interface NormalizedSalesRow {
  orderRef: string;
  customerName: string | null;
  customerEmail: string | null;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  tax: number;
  status: string;
  date: string | null;
  notes: string | null;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSalesRow(
  raw: Record<string, string>,
  rowNum: number,
): { data: NormalizedSalesRow | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const orderRef = pick(raw, "order_ref", "reference", "Order Ref", "Reference");
  const customerName = pick(raw, "customer_name", "customer", "Customer", "Customer Name");
  const customerEmail = pick(raw, "customer_email", "email", "Email", "Customer Email");
  const productName = pick(raw, "product_name", "name", "Product", "Product Name");
  const qtyRaw = pick(raw, "quantity", "qty", "Quantity");
  const priceRaw = pick(raw, "unit_price", "price", "Unit Price", "Price");
  const taxRaw = pick(raw, "tax", "Tax");
  const status = (pick(raw, "status", "Status") || "pending").toLowerCase();
  const date = pick(raw, "date", "Date", "sale_date");
  const notes = pick(raw, "notes", "Notes");

  if (!productName) errors.push(`Row ${rowNum}: product_name is required`);
  if (!customerName && !customerEmail) errors.push(`Row ${rowNum}: either customer_name or customer_email is required`);
  if (customerEmail && !emailRe.test(customerEmail)) errors.push(`Row ${rowNum}: customer_email "${customerEmail}" is not a valid email address`);

  let quantity = 0;
  if (!qtyRaw) errors.push(`Row ${rowNum}: quantity is required`);
  else if (!intRe.test(qtyRaw)) errors.push(`Row ${rowNum}: quantity "${qtyRaw}" must be a whole number`);
  else { quantity = parseInt(qtyRaw, 10); if (quantity <= 0) errors.push(`Row ${rowNum}: quantity must be greater than 0`); }

  let unitPrice: number | null = null;
  if (priceRaw) {
    if (priceRaw.includes(",")) errors.push(`Row ${rowNum}: unit_price "${priceRaw}" must not contain commas`);
    else if (!moneyRe.test(priceRaw)) errors.push(`Row ${rowNum}: unit_price "${priceRaw}" is not a valid number`);
    else unitPrice = parseFloat(priceRaw);
  } else {
    warnings.push(`Row ${rowNum}: no unit_price — will use catalog price for "${productName}"`);
  }

  let tax = 0;
  if (taxRaw) {
    if (!moneyRe.test(taxRaw)) errors.push(`Row ${rowNum}: tax "${taxRaw}" is not a valid number`);
    else tax = parseFloat(taxRaw);
  }

  if (date && !dateRe.test(date)) errors.push(`Row ${rowNum}: date "${date}" must be in YYYY-MM-DD format`);
  if (status && !["pending", "completed", "cancelled", "refunded"].includes(status)) {
    warnings.push(`Row ${rowNum}: status "${status}" is unusual — expected pending, completed, cancelled, refunded`);
  }

  if (errors.length) return { data: null, errors, warnings };

  return {
    data: {
      orderRef,
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      productName,
      quantity,
      unitPrice,
      tax,
      status,
      date: date || null,
      notes: notes || null,
    },
    errors,
    warnings,
  };
}
