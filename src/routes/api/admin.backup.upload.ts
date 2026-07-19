import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";

// Accept a JSON backup file and store it as a backup_record so it can be
// restored through the normal /api/admin/backup/:id/restore flow.
export const Route = createFileRoute("/api/admin/backup/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let payload: any;
        let originalName = "uploaded-backup.json";

        const ct = request.headers.get("content-type") ?? "";
        try {
          if (ct.includes("multipart/form-data")) {
            const form = await request.formData();
            const file = form.get("file");
            if (!(file instanceof File)) {
              return json({ message: "No file provided" }, { status: 400 });
            }
            originalName = file.name || originalName;
            payload = JSON.parse(await file.text());
          } else {
            payload = await request.json();
          }
        } catch (e: any) {
          return json({ message: `Invalid JSON: ${e?.message ?? e}` }, { status: 400 });
        }

        const snapshot = payload?.data;
        if (!snapshot || typeof snapshot !== "object") {
          return json(
            {
              valid: false,
              message:
                "Backup file must contain a `data` object mapping table names to row arrays.",
            },
            { status: 400 },
          );
        }

        const tables = Object.keys(snapshot).filter((k) => Array.isArray(snapshot[k]));
        const rowCount = tables.reduce((n, t) => n + (snapshot[t]?.length ?? 0), 0);

        const now = new Date();
        const filename = `imported-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${originalName}`;
        const stored = {
          version: payload?.version ?? 1,
          createdAt: payload?.createdAt ?? now.toISOString(),
          importedAt: now.toISOString(),
          importedFrom: originalName,
          userId: auth.user.id,
          tables,
          data: snapshot,
        };
        const sizeBytes = new TextEncoder().encode(JSON.stringify(stored)).length;

        const { data, error } = await sb
          .from("backup_records")
          .insert({
            user_id: auth.user.id,
            filename,
            size_bytes: sizeBytes,
            table_count: tables.length,
            row_count: rowCount,
            tables,
            payload: stored as any,
          } as any)
          .select("id,filename")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: "success",
          title: "Backup file imported",
          message: `${originalName} (${tables.length} tables, ${rowCount} rows). Use Restore to apply.`,
          link: "/backup",
          metadata: { backupId: data.id, action: "upload", sizeBytes },
        });

        return json({
          uploadId: data.id,
          id: data.id,
          filename: data.filename,
          valid: true,
          detectedTables: tables,
          totalRows: rowCount,
          sizeBytes,
        });
      },
    },
  },
});
