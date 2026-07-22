import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";

type RestoreMode = "merge" | "replace";

const RESTORABLE_TABLES = new Set([
  "products",
  "customers",
  "suppliers",
  "sales",
  "sale_lines",
  "stock_movements",
  "purchase_orders",
  "stock_adjustments",
  "product_transfers",
  "cash_sessions",
  "cash_movements",
  "customer_credits",
  "price_lists",
  "price_list_items",
  "reorder_rules",
  "warehouses",
  "branches",
  "expenses",
  "supplier_invoices",
]);

export const Route = createFileRoute("/api/admin/backup/$id/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let mode: RestoreMode = "merge";
        try {
          const body = await request.json().catch(() => ({}));
          if (body?.mode === "replace") mode = "replace";
        } catch {
          /* no body */
        }

        const { data: record, error: recErr } = await sb
          .from("backup_records")
          .select("id,filename,payload,tables")
          .eq("id", params.id as any)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (recErr) return json({ message: recErr.message }, { status: 500 });
        if (!record) return json({ message: "Backup not found" }, { status: 404 });

        const payload: any = (record as any).payload;
        const snapshot: Record<string, any[]> | undefined = payload?.data;
        if (!snapshot || typeof snapshot !== "object") {
          await sb.from("restore_history").insert({
            user_id: auth.user.id,
            filename: record.filename,
            tables_restored: [],
            rows_restored: 0,
            status: "skipped",
            notes: "Backup has no snapshot payload to restore.",
          } as any);
          return json(
            {
              status: "skipped",
              message: "This backup has no snapshot payload (legacy metadata-only record).",
            },
            { status: 400 },
          );
        }

        const tablesRestored: string[] = [];
        const tableErrors: string[] = [];
        let rowsRestored = 0;
        const canonicalSales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
        const canonicalLines = Array.isArray(snapshot.sale_lines) ? snapshot.sale_lines : [];

        for (const [table, rows] of Object.entries(snapshot)) {
          if (!Array.isArray(rows)) continue;
          if (!RESTORABLE_TABLES.has(table)) {
            tableErrors.push(`${table}: table is not permitted in a restore`);
            continue;
          }
          if (table === "sales" || table === "sale_lines") continue;
          // Force tenant scoping on every row we write back.
          const scoped = rows
            .filter((r) => r && typeof r === "object")
            .map((r) => ({ ...(r as Record<string, unknown>), user_id: auth.user.id }));

          try {
            // Products may be referenced by immutable sale_lines and therefore
            // cannot be cleared. Their backed-up rows are reconciled by upsert.
            if (mode === "replace" && table !== "products") {
              const { error: delErr } = await sb
                .from(table as any)
                .delete()
                .eq("user_id", auth.user.id);
              if (delErr) {
                tableErrors.push(`${table}: clear failed — ${delErr.message}`);
                continue;
              }
            }

            if (!scoped.length) {
              tablesRestored.push(table);
              continue;
            }

            const { error: upErr } = await sb
              .from(table as any)
              .upsert(scoped as any, { onConflict: "id", ignoreDuplicates: mode === "merge" });
            if (upErr) {
              // Fallback to insert when the table has no id-based conflict target.
              const { error: insErr } = await sb.from(table as any).insert(scoped as any);
              if (insErr) {
                tableErrors.push(`${table}: ${upErr.message}`);
                continue;
              }
            }
            tablesRestored.push(table);
            rowsRestored += scoped.length;
          } catch (e: any) {
            tableErrors.push(`${table}: ${e?.message ?? "unknown error"}`);
          }
        }

        if (canonicalSales.length) {
          if (!Array.isArray(snapshot.sale_lines)) {
            tableErrors.push("sales: canonical backup is missing sale_lines");
          } else {
            let restoredSales = 0;
            let restoredLines = 0;
            for (const sale of canonicalSales) {
              const lines = canonicalLines.filter((line: any) => line.sale_id === sale.id);
              if (!lines.length) {
                tableErrors.push(`sales/${sale.id}: no canonical sale lines`);
                continue;
              }
              const { error } = await (sb as any).rpc("restore_canonical_sale", {
                p_actor: auth.user.id,
                p_sale: { ...sale, user_id: auth.user.id },
                p_lines: lines,
              });
              if (error) tableErrors.push(`sales/${sale.id}: ${error.message}`);
              else {
                restoredSales += 1;
                restoredLines += lines.length;
              }
            }
            if (restoredSales === canonicalSales.length) {
              tablesRestored.push("sales", "sale_lines");
              rowsRestored += restoredSales + restoredLines;
            }
          }
        }

        const status =
          tablesRestored.length && !tableErrors.length
            ? "completed"
            : tablesRestored.length
              ? "partial"
              : "failed";
        const notes = tableErrors.length
          ? `Mode: ${mode}. Errors: ${tableErrors.join(" | ")}`
          : `Mode: ${mode}. Restored ${tablesRestored.length} table(s).`;

        await sb.from("restore_history").insert({
          user_id: auth.user.id,
          filename: record.filename,
          tables_restored: tablesRestored,
          rows_restored: rowsRestored,
          status,
          notes,
        } as any);

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: status === "completed" ? "success" : status === "partial" ? "warning" : "error",
          title:
            status === "completed"
              ? "Backup restore completed"
              : status === "partial"
                ? "Backup restore completed with errors"
                : "Backup restore failed",
          message: `${record.filename}: restored ${rowsRestored} row(s) across ${tablesRestored.length} table(s) (mode: ${mode})`,
          link: "/backup",
          metadata: {
            backupId: record.id,
            action: "restore",
            mode,
            tablesRestored,
            rowsRestored,
            errors: tableErrors,
          },
        });

        return json({
          status,
          mode,
          tablesRestored,
          rowsRestored,
          errors: tableErrors,
          message: notes,
        });
      },
    },
  },
});
