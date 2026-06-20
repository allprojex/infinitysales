import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";

// Core tenant tables included in a snapshot. Each is filtered by user_id.
const SNAPSHOT_TABLES = [
  "products",
  "customers",
  "suppliers",
  "sales",
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
] as const;

export const Route = createFileRoute("/api/admin/backup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb.from("backup_records")
          .select("id,filename,size_bytes,table_count,row_count,tables,created_at")
          .eq("user_id", auth.user.id).order("created_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map((r: any) => ({
          id: r.id, filename: r.filename, sizeBytes: Number(r.size_bytes),
          size: Number(r.size_bytes),
          tableCount: r.table_count, rowCount: r.row_count,
          tables: r.tables ?? [], createdAt: r.created_at,
        })));
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const snapshot: Record<string, unknown[]> = {};
        const includedTables: string[] = [];
        let rowCount = 0;

        for (const table of SNAPSHOT_TABLES) {
          const { data, error } = await sb.from(table as any).select("*").eq("user_id", auth.user.id);
          if (error) continue; // skip tables the user has no access to / that error out
          const rows = data ?? [];
          snapshot[table] = rows;
          includedTables.push(table);
          rowCount += rows.length;
        }

        const now = new Date();
        const filename = `backup-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
        const payload = {
          version: 1,
          createdAt: now.toISOString(),
          userId: auth.user.id,
          tables: includedTables,
          data: snapshot,
        };
        const sizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;

        const { data, error } = await sb.from("backup_records").insert({
          user_id: auth.user.id,
          filename,
          size_bytes: sizeBytes,
          table_count: includedTables.length,
          row_count: rowCount,
          tables: includedTables,
          payload: payload as any,
        } as any).select("id,filename").single();
        if (error) return json({ message: error.message }, { status: 500 });

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: "success",
          title: "Backup created",
          message: `Snapshot ${filename} (${includedTables.length} tables, ${rowCount} rows)`,
          link: "/backup",
          metadata: { backupId: data.id, action: "create", sizeBytes },
        });

        return json({
          id: data.id,
          filename: data.filename,
          success: true,
          tableCount: includedTables.length,
          rowCount,
          sizeBytes,
        });
      },
    },
  },
});
