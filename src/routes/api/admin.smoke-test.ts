import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";

// Marker used to identify smoke-test rows across tables, so cleanup is precise
// and never touches real production data.
const MARKER = "[SMOKE_TEST]";

export const Route = createFileRoute("/api/admin/smoke-test")({
  server: {
    handlers: {
      // Seed a representative slice of data across core tables.
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const userId = auth.user.id;
        const stamp = Date.now();
        const ref = (kind: string, i: number) => `SMOKE-${kind}-${stamp}-${i}`;
        const created = { products: 0, customers: 0, suppliers: 0, sales: 0, purchaseOrders: 0 };
        const errors: string[] = [];

        // Suppliers
        const supplierRows = [1, 2].map((i) => ({
          user_id: userId,
          name: `Smoke Supplier ${i}`,
          email: `smoke-supplier-${i}-${stamp}@infinity.local`,
          notes: MARKER,
          is_active: true,
        }));
        const { data: suppliers, error: supErr } = await sb
          .from("suppliers").insert(supplierRows).select("id,name");
        if (supErr) errors.push(`suppliers: ${supErr.message}`);
        else created.suppliers = suppliers?.length ?? 0;

        // Customers (id is bigint; email is required)
        const customerRows = [1, 2, 3].map((i) => ({
          user_id: userId,
          name: `Smoke Customer ${i}`,
          email: `smoke-customer-${i}-${stamp}@infinity.local`,
          status: "active",
          address: MARKER,
        }));
        const { data: customers, error: custErr } = await sb
          .from("customers").insert(customerRows).select("id,name");
        if (custErr) errors.push(`customers: ${custErr.message}`);
        else created.customers = customers?.length ?? 0;

        // Products (tag via attributes.smoke_test + description marker for safety)
        const productRows = [1, 2, 3].map((i) => ({
          user_id: userId,
          name: `Smoke Product ${i}`,
          sku: `SMOKE-SKU-${stamp}-${i}`,
          category: "Smoke Test",
          unit: "pc",
          price: 10 * i,
          cost: 5 * i,
          stock: 100,
          reorder_level: 10,
          is_active: true,
          description: MARKER,
          attributes: { smoke_test: true } as any,
        }));
        const { data: products, error: prodErr } = await sb
          .from("products").insert(productRows).select("id,name,price");
        if (prodErr) errors.push(`products: ${prodErr.message}`);
        else created.products = products?.length ?? 0;

        // Sales (use the first product/customer if available)
        if (products?.length && customers?.length) {
          const items = products.slice(0, 2).map((p) => ({
            product_id: p.id, name: p.name, quantity: 1, price: p.price, total: p.price,
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
            subtotal, tax: 0, discount: 0, total: subtotal, paid: subtotal,
            items: items as any,
            notes: MARKER,
          }));
          const { data: salesInserted, error: salesErr } = await sb
            .from("sales").insert(salesRows).select("id");
          if (salesErr) errors.push(`sales: ${salesErr.message}`);
          else created.sales = salesInserted?.length ?? 0;
        }

        // Purchase orders
        if (products?.length && suppliers?.length) {
          const items = products.slice(0, 2).map((p) => ({
            product_name: p.name, sku: null, quantity: 10, unit_cost: 5, line_total: 50,
          }));
          const subtotal = items.reduce((s, it) => s + it.line_total, 0);
          const poRows = [1].map((i) => ({
            user_id: userId,
            reference: ref("PO", i),
            supplier_id: null as any,
            status: "pending",
            subtotal, tax: 0, discount: 0, total: subtotal,
            items: items as any,
            notes: MARKER,
            ordered_at: new Date().toISOString(),
          }));
          const { data: poInserted, error: poErr } = await sb
            .from("purchase_orders").insert(poRows).select("id");
          if (poErr) errors.push(`purchase_orders: ${poErr.message}`);
          else created.purchaseOrders = poInserted?.length ?? 0;
        }

        await notify({
          userId,
          type: "system",
          severity: errors.length ? "warning" : "success",
          title: "Smoke-test seed data created",
          message: `Seeded ${created.products}p / ${created.customers}c / ${created.suppliers}s / ${created.sales} sales / ${created.purchaseOrders} POs`,
          link: "/products",
          metadata: { stamp, created, errors },
        });

        return json({ success: !errors.length, created, errors, marker: MARKER, stamp });
      },

      // Remove every row previously created by the seeder (scoped to caller).
      DELETE: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const userId = auth.user.id;
        const removed = { products: 0, customers: 0, suppliers: 0, sales: 0, purchaseOrders: 0 };
        const errors: string[] = [];

        const del = async (
          key: keyof typeof removed,
          table: string,
          column: string,
        ) => {
          const { count, error } = await sb
            .from(table as any)
            .delete({ count: "exact" })
            .eq("user_id", userId)
            .eq(column, MARKER);
          if (error) errors.push(`${String(key)}: ${error.message}`);
          else removed[key] = count ?? 0;
        };

        await del("sales", "sales", "notes");
        await del("purchaseOrders", "purchase_orders", "notes");
        await del("products", "products", "description");
        await del("customers", "customers", "address");
        await del("suppliers", "suppliers", "notes");

        await notify({
          userId,
          type: "system",
          severity: errors.length ? "warning" : "success",
          title: "Smoke-test data cleaned up",
          message: `Removed ${removed.products}p / ${removed.customers}c / ${removed.suppliers}s / ${removed.sales} sales / ${removed.purchaseOrders} POs`,
          link: "/products",
          metadata: { removed, errors },
        });

        return json({ success: !errors.length, removed, errors });
      },
    },
  },
});
