import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const expectedRef = process.env.DISPOSABLE_SUPABASE_PROJECT_REF;
const appBaseUrl = process.env.APP_BASE_URL;
const confirmation = process.env.SALES_ENGINE_DISPOSABLE_CONFIRM;
const productionRef = "vcgtjdkpgbkyzrbonkbs";

function fail(message, detail) {
  const suffix = detail ? `\n${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
  throw new Error(`${message}${suffix}`);
}

if (!url || !serviceKey || !publishableKey || !expectedRef || !appBaseUrl) {
  fail(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, DISPOSABLE_SUPABASE_PROJECT_REF, and APP_BASE_URL.",
  );
}
if (confirmation !== "I_UNDERSTAND_THIS_PROJECT_WILL_BE_DISCARDED") {
  fail("Refusing to run without the disposable-project confirmation value from the runbook.");
}
const hostname = new URL(url).hostname;
const isLocal = hostname === "127.0.0.1" || hostname === "localhost";
if (
  expectedRef === productionRef ||
  (isLocal ? expectedRef !== "local" : !hostname.startsWith(`${expectedRef}.`))
) {
  fail(`Safety check rejected Supabase host ${hostname}.`);
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runId = randomUUID().slice(0, 8);
const password = `Disposable-${randomUUID()}-aA1!`;
const outsiderPassword = `Disposable-${randomUUID()}-aA1!`;

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

async function expectFailure(label, operation) {
  const { error } = await operation();
  assert(error, `${label} unexpectedly succeeded`);
  return error;
}

async function signIn(email, userPassword) {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: userPassword });
  if (error) fail(`Could not sign in ${email}`, error.message);
  return { client, accessToken: data.session.access_token };
}

async function fetchReport(path, accessToken) {
  const response = await fetch(new URL(path, appBaseUrl), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();
  assert(response.ok, `Report ${path} returned ${response.status}`, body);
  return body;
}

const ownerEmail = `sales-engine-owner-${runId}@example.invalid`;
const outsiderEmail = `sales-engine-outsider-${runId}@example.invalid`;
const createdUsers = [];

console.log(`Validated disposable target: ${expectedRef}`);
console.log(
  "This test intentionally leaves canonical test records behind; discard the project afterward.",
);

try {
  for (const [email, userPassword] of [
    [ownerEmail, password],
    [outsiderEmail, outsiderPassword],
  ]) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
    });
    if (error || !data.user) fail(`Could not create ${email}`, error?.message);
    createdUsers.push(data.user.id);
  }
  const [ownerId] = createdUsers;

  const { data: category, error: categoryError } = await service
    .from("product_categories")
    .select("id,name")
    .eq("name", "Other")
    .single();
  if (categoryError || !category) fail("Could not load the seed category", categoryError?.message);

  const { data: warehouse, error: warehouseError } = await service
    .from("warehouses")
    .insert({
      user_id: ownerId,
      name: `Disposable Warehouse ${runId}`,
      code: `D-${runId}`,
      is_default: true,
      is_active: true,
    })
    .select("uuid_id")
    .single();
  if (warehouseError || !warehouse) fail("Could not create warehouse", warehouseError?.message);

  const { data: product, error: productError } = await service
    .from("products")
    .insert({
      user_id: ownerId,
      name: `Immutable Product ${runId}`,
      sku: `IMM-${runId}`,
      category_id: category.id,
      category: category.name,
      price: 12.5,
      cost: 7.25,
      tax_rate: 1.25,
      stock: 50,
      warehouse_id: warehouse.uuid_id,
    })
    .select("id,stock")
    .single();
  if (productError || !product) fail("Could not create product", productError?.message);

  const { data: customer, error: customerError } = await service
    .from("customers")
    .insert({
      user_id: ownerId,
      name: `Disposable Customer ${runId}`,
      email: `customer-${runId}@example.invalid`,
      total_spend: 0,
    })
    .select("uuid_id,total_spend")
    .single();
  if (customerError || !customer) fail("Could not create customer", customerError?.message);

  const idempotencyKey = randomUUID();
  const saleInput = {
    idempotency_key: idempotencyKey,
    reference: `VALIDATE-${runId}`,
    customer_id: customer.uuid_id,
    warehouse_id: warehouse.uuid_id,
    status: "completed",
    payment_status: "unpaid",
    payment_method: "credit",
    paid: 0,
    total: 26.25,
    subtotal: 25,
    tax: 1.25,
    discount: 0,
    source_system: "application",
    effects_mode: "post",
    snapshot_completeness: "complete",
  };
  const lineInput = [{ productId: product.id, quantity: 2, unitPrice: 12.5, taxAmount: 1.25 }];

  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      service.rpc("create_sale_atomic", {
        p_actor: ownerId,
        p_sale: saleInput,
        p_lines: lineInput,
      }),
    ),
  );
  for (const attempt of attempts) {
    if (attempt.error) fail("Canonical retry failed", attempt.error.message);
  }
  const saleIds = new Set(attempts.map(({ data }) => data.id));
  assert(saleIds.size === 1, "Retries returned more than one sale identity", [...saleIds]);
  const saleId = attempts[0].data.id;

  const [salesCount, lineRows, movementCount, auditCount, productAfter, customerAfter, credits] =
    await Promise.all([
      service
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", idempotencyKey),
      service.from("sale_lines").select("*").eq("sale_id", saleId),
      service
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", saleId),
      service
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "sale")
        .eq("entity_id", saleId)
        .eq("action", "create"),
      service.from("products").select("stock").eq("id", product.id).single(),
      service.from("customers").select("total_spend").eq("uuid_id", customer.uuid_id).single(),
      service.from("customer_credits").select("amount").eq("reference", saleInput.reference),
    ]);
  assert(
    !lineRows.error && lineRows.data.length === 1,
    "Canonical line was not written exactly once",
    lineRows.error,
  );
  assert(salesCount.count === 1, "Idempotency created duplicate sales", salesCount);
  assert(movementCount.count === 1, "Idempotency created duplicate stock movements", movementCount);
  assert(auditCount.count === 1, "Idempotency created duplicate audit entries", auditCount);
  assert(
    Number(productAfter.data?.stock) === 48,
    "Inventory was not deducted exactly once",
    productAfter,
  );
  assert(
    Number(customerAfter.data?.total_spend) === 26.25,
    "Customer spend was not updated exactly once",
    customerAfter,
  );
  assert(
    credits.data?.length === 1 && Number(credits.data[0].amount) === 26.25,
    "Receivables were not written exactly once",
    credits,
  );
  console.log(
    "PASS canonical creation, concurrent idempotency, inventory, customer spend, receivable, and audit effects.",
  );

  const canonicalLine = lineRows.data[0];
  for (const field of [
    "id",
    "product_id",
    "product_name",
    "sku",
    "warehouse_id",
    "branch_id",
    "quantity",
    "unit_price",
    "unit_cost",
    "gross_amount",
    "discount_amount",
    "tax_amount",
    "total_amount",
    "cogs_amount",
    "promotion_snapshot",
    "batch_number",
    "expiry_date",
    "serial_numbers",
    "sold_at",
  ])
    assert(Object.hasOwn(canonicalLine, field), `Snapshot is missing ${field}`);

  await expectFailure("service-role sale insert", () =>
    service.from("sales").insert({ user_id: ownerId, idempotency_key: randomUUID() }),
  );
  await expectFailure("service-role line append", () =>
    service.from("sale_lines").insert({ ...canonicalLine, id: randomUUID(), line_number: 2 }),
  );
  await expectFailure("service-role immutable-line update", () =>
    service.from("sale_lines").update({ unit_price: 1 }).eq("id", canonicalLine.id),
  );

  const ownerAuth = await signIn(ownerEmail, password);
  const outsiderAuth = await signIn(outsiderEmail, outsiderPassword);
  const owner = ownerAuth.client;
  const outsider = outsiderAuth.client;
  const ownerRead = await owner.from("sale_lines").select("id").eq("sale_id", saleId);
  assert(!ownerRead.error && ownerRead.data.length === 1, "Owner RLS read failed", ownerRead.error);
  const outsiderRead = await outsider.from("sale_lines").select("id").eq("sale_id", saleId);
  assert(
    !outsiderRead.error && outsiderRead.data.length === 0,
    "RLS exposed sale lines to another user",
  );
  await expectFailure("authenticated canonical RPC", () =>
    owner.rpc("create_sale_atomic", {
      p_actor: ownerId,
      p_sale: { ...saleInput, idempotency_key: randomUUID() },
      p_lines: lineInput,
    }),
  );
  await expectFailure("authenticated direct line append", () =>
    owner.from("sale_lines").insert({ ...canonicalLine, id: randomUUID(), line_number: 2 }),
  );
  console.log("PASS service-role append protection and authenticated owner/outsider RLS.");

  const originalProductName = canonicalLine.product_name;
  const originalCategoryName = canonicalLine.category_name;
  const { data: changedCategory, error: changedCategoryError } = await service
    .from("product_categories")
    .insert({ name: `Changed After Sale ${runId}` })
    .select("id")
    .single();
  if (changedCategoryError) fail("Could not create changed category", changedCategoryError.message);
  const catalogueEdit = await service
    .from("products")
    .update({
      name: `Edited Product ${runId}`,
      category_id: changedCategory.id,
      category: `Changed After Sale ${runId}`,
      price: 999,
      cost: 888,
      warehouse_id: null,
    })
    .eq("id", product.id);
  if (catalogueEdit.error)
    fail("Could not perform the historical-isolation edit", catalogueEdit.error.message);

  const salesReport = await fetchReport("/api/reports/sales", ownerAuth.accessToken);
  const categoryReport = await fetchReport("/api/reports/category-summary", ownerAuth.accessToken);
  const usersReport = await fetchReport(
    "/api/reports/users-transaction-summary",
    ownerAuth.accessToken,
  );
  const reportedSale = salesReport.items?.find((row) => row.id === saleId);
  assert(
    reportedSale?.items?.[0]?.productName === originalProductName,
    "Sales report followed the edited product name",
  );
  assert(
    reportedSale?.items?.[0]?.categoryName === originalCategoryName,
    "Sales report followed the edited product category",
  );
  const reportedCategory = categoryReport.data?.find(
    (row) => row.categoryId === canonicalLine.category_id,
  );
  assert(
    Number(reportedCategory?.unitsSold) === 2 && Number(reportedCategory?.salesValue) === 26.25,
    "Category report did not retain canonical historical facts",
    reportedCategory,
  );
  const reportedUser = usersReport.rows?.find(
    (row) => row.userId === ownerId && row.category === originalCategoryName,
  );
  assert(
    Number(reportedUser?.itemsSold) === 2 && Number(reportedUser?.totalAmount) === 26.25,
    "User transaction report did not retain canonical historical facts",
    reportedUser,
  );
  console.log("PASS Phase A historical reports after mutable catalogue edits.");

  const { data: saleBackup, error: saleBackupError } = await service
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .single();
  if (saleBackupError) fail("Could not read canonical sale backup", saleBackupError.message);

  // Snapshot every effect a restore must NOT repeat, before restoring.
  const [beforeMovements, beforeCredits, beforeCustomer, beforeAuditCreate] = await Promise.all([
    service
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("reference_id", saleId),
    service
      .from("customer_credits")
      .select("id", { count: "exact", head: true })
      .eq("reference", saleInput.reference),
    service.from("customers").select("total_spend").eq("uuid_id", customer.uuid_id).single(),
    service
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "sale")
      .eq("entity_id", saleId)
      .eq("action", "create"),
  ]);

  const restoreSaleId = randomUUID();
  const restoreLineId = randomUUID();
  const restoreSale = {
    ...saleBackup,
    id: restoreSaleId,
    idempotency_key: randomUUID(),
    reference: `RESTORE-${runId}`,
  };
  const restoreLines = lineRows.data.map((line) => ({
    ...line,
    id: restoreLineId,
    sale_id: restoreSaleId,
  }));
  const restored = await service.rpc("restore_canonical_sale", {
    p_actor: ownerId,
    p_sale: restoreSale,
    p_lines: restoreLines,
  });
  if (restored.error) fail("Canonical restore failed", restored.error.message);
  const restoredLines = await service.from("sale_lines").select("*").eq("sale_id", restoreSaleId);
  assert(
    !restoredLines.error && restoredLines.data.length === 1,
    "Restore did not preserve line count",
  );
  assert(restoredLines.data[0].id === restoreLineId, "Restore changed the stable line identity");

  // Full-fidelity field comparison — every canonical fact the backup carried
  // must come back unchanged, not just a handful of spot-checked fields.
  const lineFields = [
    "product_id",
    "branch_id",
    "warehouse_id",
    "sold_at",
    "product_name",
    "sku",
    "category_id",
    "category_name",
    "quantity",
    "unit_price",
    "unit_cost",
    "tax_rate",
    "gross_amount",
    "discount_amount",
    "tax_amount",
    "total_amount",
    "cogs_amount",
    "batch_number",
    "expiry_date",
    "serial_numbers",
    "promotion_snapshot",
    "known_fields",
    "snapshot_completeness",
    "created_at",
  ];
  for (const field of lineFields) {
    assert(
      JSON.stringify(restoredLines.data[0][field]) === JSON.stringify(restoreLines[0][field]),
      `Restore changed line field ${field} relative to the backup`,
    );
  }
  const restoredSaleFull = await service.from("sales").select("*").eq("id", restoreSaleId).single();
  const saleHeaderFields = [
    "branch_id",
    "warehouse_id",
    "sold_at",
    "created_at",
    "source_system",
    "effects_mode",
    "snapshot_completeness",
    "return_eligible",
    "subtotal",
    "tax",
    "discount",
    "total",
    "paid",
    "change_due",
  ];
  for (const field of saleHeaderFields) {
    assert(
      JSON.stringify(restoredSaleFull.data[field]) === JSON.stringify(saleBackup[field]),
      `Restore changed sale header field ${field} relative to the backup`,
    );
  }
  assert(restoredSaleFull.data.id === restoreSaleId, "Restore did not preserve the sale UUID");
  console.log("PASS canonical backup payload and exact restore identity/snapshots.");

  // A restore must never repost inventory, customer, receivable, or
  // sale-creation-audit effects — those belong to their own backups.
  const [afterMovements, afterCredits, afterCustomer, afterAuditCreate, restoreAudit] =
    await Promise.all([
      service
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", saleId),
      service
        .from("customer_credits")
        .select("id", { count: "exact", head: true })
        .eq("reference", saleInput.reference),
      service.from("customers").select("total_spend").eq("uuid_id", customer.uuid_id).single(),
      service
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "sale")
        .eq("entity_id", saleId)
        .eq("action", "create"),
      service
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "sale")
        .eq("entity_id", restoreSaleId)
        .eq("action", "restore"),
    ]);
  assert(afterMovements.count === beforeMovements.count, "Restore reposted a stock movement");
  assert(
    afterCredits.count === beforeCredits.count,
    "Restore reposted a customer credit/receivable",
  );
  assert(
    Number(afterCustomer.data?.total_spend) === Number(beforeCustomer.data?.total_spend),
    "Restore re-applied customer spend",
  );
  assert(
    afterAuditCreate.count === beforeAuditCreate.count,
    "Restore duplicated the original sale-creation audit entry",
  );
  assert(restoreAudit.count === 1, "Restore did not write its own distinct 'restore' audit entry");
  console.log(
    "PASS restore does not repost inventory, customer, receivable, or creation-audit effects.",
  );

  // --- Synthetic backup-shape coverage: JSON null vs object vs array vs
  // invalid shape, and a legacy_partial line. These exercise
  // normalize_restored_jsonb() directly and don't depend on a real product,
  // warehouse, or branch row, since sale_lines.product_id carries no FK.
  const isoNow = () => new Date().toISOString();
  function syntheticSale(overrides = {}) {
    const id = randomUUID();
    return {
      id,
      user_id: ownerId,
      idempotency_key: randomUUID(),
      reference: `SYN-${id.slice(0, 8)}`,
      customer_id: null,
      branch_id: null,
      warehouse_id: null,
      cash_session_id: null,
      channel: "pos",
      status: "completed",
      payment_status: "paid",
      payment_method: "cash",
      subtotal: 10,
      tax: 0,
      discount: 0,
      total: 10,
      paid: 10,
      change_due: 0,
      items: [],
      notes: null,
      sold_at: isoNow(),
      created_at: isoNow(),
      updated_at: isoNow(),
      snapshot_version: 1,
      source_system: "historical_import",
      effects_mode: "historical_no_post",
      snapshot_completeness: "catalog_at_import",
      return_eligible: false,
      currency: "GHS",
      effects_posted_at: null,
      engine_created_at: isoNow(),
      ...overrides,
    };
  }
  function syntheticLine(saleId2, overrides = {}) {
    return {
      id: randomUUID(),
      sale_id: saleId2,
      line_number: 1,
      product_id: randomUUID(),
      branch_id: null,
      warehouse_id: null,
      sold_at: isoNow(),
      product_name: "Synthetic Product",
      sku: "SYN-SKU",
      barcode: null,
      category_id: null,
      category_name: "Other",
      brand: null,
      unit: "unit",
      quantity: 1,
      unit_price: 10,
      unit_cost: 5,
      tax_rate: 0,
      gross_amount: 10,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 10,
      cogs_amount: 5,
      batch_number: null,
      expiry_date: null,
      serial_numbers: null,
      promotion_snapshot: null,
      pricing_snapshot: {},
      product_snapshot: {},
      source_payload: {},
      known_fields: {},
      snapshot_completeness: "complete",
      created_at: isoNow(),
      ...overrides,
    };
  }

  {
    const sale = syntheticSale();
    const line = syntheticLine(sale.id, { promotion_snapshot: null, serial_numbers: null });
    const r = await service.rpc("restore_canonical_sale", {
      p_actor: ownerId,
      p_sale: sale,
      p_lines: [line],
    });
    if (r.error) fail("SQL NULL round-trip restore failed", r.error.message);
    const stored = await service.from("sale_lines").select("*").eq("id", line.id).single();
    assert(
      stored.data.promotion_snapshot === null,
      "promotion_snapshot did not restore as SQL NULL",
    );
    assert(stored.data.serial_numbers === null, "serial_numbers did not restore as SQL NULL");
  }
  {
    const sale = syntheticSale();
    const promo = { type: "percentage", value: 10, code: "SAVE10" };
    const line = syntheticLine(sale.id, { promotion_snapshot: promo });
    const r = await service.rpc("restore_canonical_sale", {
      p_actor: ownerId,
      p_sale: sale,
      p_lines: [line],
    });
    if (r.error) fail("Object round-trip restore failed", r.error.message);
    const stored = await service
      .from("sale_lines")
      .select("promotion_snapshot")
      .eq("id", line.id)
      .single();
    assert(
      JSON.stringify(stored.data.promotion_snapshot) === JSON.stringify(promo),
      "promotion_snapshot object did not round-trip exactly",
    );
  }
  {
    const sale = syntheticSale();
    const serials = ["SN-001", "SN-002"];
    const line = syntheticLine(sale.id, { serial_numbers: serials });
    const r = await service.rpc("restore_canonical_sale", {
      p_actor: ownerId,
      p_sale: sale,
      p_lines: [line],
    });
    if (r.error) fail("Array round-trip restore failed", r.error.message);
    const stored = await service
      .from("sale_lines")
      .select("serial_numbers")
      .eq("id", line.id)
      .single();
    assert(
      JSON.stringify(stored.data.serial_numbers) === JSON.stringify(serials),
      "serial_numbers array did not round-trip exactly",
    );
  }
  {
    const sale = syntheticSale();
    const line = syntheticLine(sale.id, { promotion_snapshot: "not-an-object" });
    const r = await service.rpc("restore_canonical_sale", {
      p_actor: ownerId,
      p_sale: sale,
      p_lines: [line],
    });
    assert(r.error, "Invalid promotion_snapshot shape was silently accepted instead of rejected");
  }
  {
    const sale = syntheticSale({
      snapshot_completeness: "legacy_partial",
      return_eligible: false,
      source_system: "legacy",
      effects_mode: "historical_no_post",
    });
    const line = syntheticLine(sale.id, {
      snapshot_completeness: "legacy_partial",
      quantity: null,
      unit_price: null,
      unit_cost: null,
      tax_rate: null,
      gross_amount: null,
      discount_amount: null,
      tax_amount: null,
      total_amount: null,
      cogs_amount: null,
      known_fields: { quantity: false, unitPrice: false },
    });
    const r = await service.rpc("restore_canonical_sale", {
      p_actor: ownerId,
      p_sale: sale,
      p_lines: [line],
    });
    if (r.error) fail("legacy_partial restore failed", r.error.message);
    const stored = await service.from("sale_lines").select("*").eq("id", line.id).single();
    assert(stored.data.quantity === null, "legacy_partial quantity was not preserved as NULL");
    assert(
      stored.data.snapshot_completeness === "legacy_partial",
      "snapshot_completeness was not preserved",
    );
  }
  console.log(
    "PASS SQL-null/object/array round-trip, invalid-shape rejection, and legacy_partial restore.",
  );

  console.log(
    "PASS canonical creation, concurrent idempotency, side effects, append protection, RLS, restore, and Phase A reports.",
  );
} catch (error) {
  console.error("FAIL disposable Sales Engine validation");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
