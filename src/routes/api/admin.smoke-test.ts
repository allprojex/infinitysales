import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json, parseQuery } from "./_resource-helpers";
import { notify } from "./_notify";
import { markerFor, scopedMarkerFromParam, cleanupFilter } from "./-smoke-test-helpers";
import { createSaleThroughEngine } from "./-sale-engine";
import { deterministicTransactionKey } from "../../lib/logical-idempotency";

type Counts = {
  products: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchaseOrders: number;
};
const emptyCounts = (): Counts => ({
  products: 0,
  customers: 0,
  suppliers: 0,
  sales: 0,
  purchaseOrders: 0,
});

export const Route = createFileRoute("/api/admin/smoke-test")({
  server: {
    handlers: {
      // Seed a representative slice of data across core tables. Best-effort
      // across independently-scoped inserts (no cross-table DB transaction is
      // available via PostgREST) - if a later step fails, everything this run
      // already created is rolled back via its own run-scoped marker so a
      // partial run never leaves orphaned rows behind.
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const userId = auth.user.id;
        const stamp = Date.now();
        const marker = markerFor(stamp);
        const ref = (kind: string, i: number) => `SMOKE-${kind}-${stamp}-${i}`;
        const created = emptyCounts();
        const errors: string[] = [];
        const rollbackSteps: Array<{ table: string; column: string }> = [];

        // Suppliers
        const supplierRows = [1, 2].map((i) => ({
          user_id: userId,
          name: `Smoke Supplier ${i}`,
          email: `smoke-supplier-${i}-${stamp}@infinity.local`,
          notes: marker,
          is_active: true,
        }));
        const { data: suppliers, error: supErr } = await sb
          .from("suppliers")
          .insert(supplierRows)
          .select("id,name");
        if (supErr) errors.push(`suppliers: ${supErr.message}`);
        else {
          created.suppliers = suppliers?.length ?? 0;
          rollbackSteps.push({ table: "suppliers", column: "notes" });
        }

        // Customers (id is bigint; email is required)
        const customerRows = [1, 2, 3].map((i) => ({
          user_id: userId,
          name: `Smoke Customer ${i}`,
          email: `smoke-customer-${i}-${stamp}@infinity.local`,
          status: "active",
          address: marker,
        }));
        const { data: customers, error: custErr } = await sb
          .from("customers")
          .insert(customerRows)
          .select("id,name");
        if (custErr) errors.push(`customers: ${custErr.message}`);
        else {
          created.customers = customers?.length ?? 0;
          rollbackSteps.push({ table: "customers", column: "address" });
        }

        // Products (tag via attributes.smoke_test + description marker for safety)
        // products.category_id is a required FK; reuse one stable "Smoke Test"
        // category across runs rather than creating/cleaning up a new row each time.
        let categoryId: string | undefined;
        const { data: existingCategory } = await sb
          .from("product_categories")
          .select("id")
          .ilike("name", "Smoke Test")
          .maybeSingle();
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const { data: newCategory, error: catErr } = await sb
            .from("product_categories")
            .insert({ name: "Smoke Test", is_active: true })
            .select("id")
            .single();
          if (catErr) errors.push(`product_categories: ${catErr.message}`);
          else categoryId = newCategory?.id;
        }

        let products: { id: string; name: string; price: number | null }[] | null = null;
        if (categoryId) {
          const productRows = [1, 2, 3].map((i) => ({
            user_id: userId,
            name: `Smoke Product ${i}`,
            sku: `SMOKE-SKU-${stamp}-${i}`,
            category: "Smoke Test",
            category_id: categoryId,
            unit: "pc",
            price: 10 * i,
            cost: 5 * i,
            stock: 100,
            reorder_level: 10,
            is_active: true,
            description: marker,
            attributes: { smoke_test: true, stamp } as any,
          }));
          const { data: insertedProducts, error: prodErr } = await sb
            .from("products")
            .insert(productRows)
            .select("id,name,price");
          if (prodErr) errors.push(`products: ${prodErr.message}`);
          else {
            products = insertedProducts;
            created.products = products?.length ?? 0;
            rollbackSteps.push({ table: "products", column: "description" });
          }
        }

        // Sales (use the first product/customer if available)
        if (!errors.length && products?.length && customers?.length) {
          const items = products.slice(0, 2).map((p) => ({
            product_id: p.id,
            name: p.name,
            quantity: 1,
            price: Number(p.price ?? 0),
            total: Number(p.price ?? 0),
          }));
          const subtotal = items.reduce((s, it) => s + Number(it.total), 0);
          // NOTE: sales.customer_id is uuid while customers.id is bigint in this
          // schema, so we cannot link the seeded customer. Leave null to avoid
          // "invalid input syntax for type uuid" errors.
          const salesRows = [1, 2].map((i) => ({
            user_id: userId,
            reference: ref("S", i),
            customer_id: null as any,
            channel: "pos",
            status: "completed",
            payment_status: "paid",
            payment_method: "cash",
            subtotal,
            tax: 0,
            discount: 0,
            total: subtotal,
            paid: subtotal,
            items: items as any,
            notes: marker,
          }));
          for (const saleRow of salesRows) {
            const idempotencyKey = await deterministicTransactionKey(
              `smoke-sale:${userId}:${marker}:${saleRow.reference}`,
              saleRow,
            );
            const saleResult = await createSaleThroughEngine(
              userId,
              {
                ...saleRow,
                idempotencyKey,
              },
              {
                applyPromotions: false,
                sourceSystem: "smoke_test",
                effectsMode: "historical_no_post",
                snapshotCompleteness: "complete",
                pricingSource: "smoke_test",
              },
            );
            if (saleResult.error) {
              errors.push(`sales: ${saleResult.error}`);
              break;
            }
            created.sales += 1;
          }
          if (created.sales > 0) {
            rollbackSteps.push({ table: "sales", column: "notes" });
          }
        }

        // Purchase orders
        if (!errors.length && products?.length && suppliers?.length) {
          const items = products.slice(0, 2).map((p) => ({
            product_name: p.name,
            sku: null,
            quantity: 10,
            unit_cost: 5,
            line_total: 50,
          }));
          const subtotal = items.reduce((s, it) => s + it.line_total, 0);
          const poRows = [1].map(() => ({
            user_id: userId,
            reference: ref("PO", 1),
            supplier_id: null as any,
            status: "pending",
            subtotal,
            tax: 0,
            discount: 0,
            total: subtotal,
            items: items as any,
            notes: marker,
            ordered_at: new Date().toISOString(),
          }));
          const { data: poInserted, error: poErr } = await sb
            .from("purchase_orders")
            .insert(poRows)
            .select("id");
          if (poErr) errors.push(`purchase_orders: ${poErr.message}`);
          else {
            created.purchaseOrders = poInserted?.length ?? 0;
            rollbackSteps.push({ table: "purchase_orders", column: "notes" });
          }
        }

        let rolledBack = false;
        const rollbackErrors: string[] = [];
        if (errors.length && rollbackSteps.length) {
          // Reverse dependency order: canonical sale lines reference products.
          for (const { table, column } of [...rollbackSteps].reverse()) {
            if (table === "sales") {
              const { error } = await (sb as any).rpc("purge_smoke_test_sales", {
                p_actor: userId,
                p_marker: marker,
              });
              if (error) rollbackErrors.push(`sales: ${error.message}`);
              continue;
            }
            const { error } = await sb
              .from(table as any)
              .delete()
              .eq("user_id", userId)
              .eq(column, marker);
            if (error) rollbackErrors.push(`${table}: ${error.message}`);
          }
          if (!rollbackErrors.length) {
            rolledBack = true;
            created.products = 0;
            created.customers = 0;
            created.suppliers = 0;
            created.sales = 0;
            created.purchaseOrders = 0;
          }
        }

        await notify({
          userId,
          type: "system",
          severity: errors.length ? "warning" : "success",
          title: rolledBack
            ? "Smoke-test seed failed and was rolled back"
            : "Smoke-test data seeded",
          message: rolledBack
            ? `Run ${stamp} failed partway (${errors.join("; ")}) - all rows from this run were removed.`
            : `Seeded ${created.products}p / ${created.customers}c / ${created.suppliers}s / ${created.sales} sales / ${created.purchaseOrders} POs`,
          link: "/products",
          metadata: { stamp, marker, created, errors, rolledBack, rollbackErrors },
        });

        return json({
          success: !errors.length,
          created,
          errors,
          rolledBack,
          rollbackErrors: rollbackErrors.length ? rollbackErrors : undefined,
          marker,
          stamp,
        });
      },

      // Remove rows created by the seeder. Pass ?stamp=<stamp> (returned by
      // POST) to remove only that exact run; omitting it falls back to
      // removing every smoke-test-marked row for the caller, including
      // legacy pre-run-marker rows - a deliberate "sweep everything" escape
      // hatch, not the default path the UI takes after a normal seed.
      DELETE: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const userId = auth.user.id;
        const { params } = parseQuery(request);
        const stampParam = params.get("stamp");
        const scopedMarker = scopedMarkerFromParam(stampParam);
        const removed = emptyCounts();
        const errors: string[] = [];

        const del = async (key: keyof Counts, table: string, column: string) => {
          const q = sb
            .from(table as any)
            .delete({ count: "exact" })
            .eq("user_id", userId)
            .or(cleanupFilter(column, scopedMarker));
          const { count, error } = await q;
          if (error) errors.push(`${String(key)}: ${error.message}`);
          else removed[key] = count ?? 0;
        };

        const { data: removedSales, error: salesError } = await (sb as any).rpc(
          "purge_smoke_test_sales",
          { p_actor: userId, p_marker: scopedMarker },
        );
        if (salesError) errors.push(`sales: ${salesError.message}`);
        else removed.sales = Number(removedSales ?? 0);
        await del("purchaseOrders", "purchase_orders", "notes");
        await del("products", "products", "description");
        await del("customers", "customers", "address");
        await del("suppliers", "suppliers", "notes");

        await notify({
          userId,
          type: "system",
          severity: errors.length ? "warning" : "success",
          title: "Smoke-test data cleaned up",
          message: scopedMarker
            ? `Removed run ${stampParam}: ${removed.products}p / ${removed.customers}c / ${removed.suppliers}s / ${removed.sales} sales / ${removed.purchaseOrders} POs`
            : `Removed all smoke-test runs: ${removed.products}p / ${removed.customers}c / ${removed.suppliers}s / ${removed.sales} sales / ${removed.purchaseOrders} POs`,
          link: "/products",
          metadata: { removed, errors, scoped: !!scopedMarker, stamp: stampParam ?? null },
        });

        return json({ success: !errors.length, removed, errors, scoped: !!scopedMarker });
      },
    },
  },
});
