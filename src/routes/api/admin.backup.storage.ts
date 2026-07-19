import { createFileRoute } from "@tanstack/react-router";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin, json } from "./_resource-helpers";
import { notify } from "./_notify";

// Buckets included in a storage backup. Add new buckets here.
const BUCKETS = ["product-images"] as const;

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return out;
  for (const item of data) {
    if (!item.name) continue;
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders have no metadata/id
    if ((item as any).id === null || (item as any).metadata === null) {
      out.push(...(await listAll(bucket, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

export const Route = createFileRoute("/api/admin/backup/storage")({
  server: {
    handlers: {
      // Export all storage buckets as a single zip archive.
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const files: Record<string, Uint8Array> = {};
        const manifest: Array<{ bucket: string; path: string; size: number }> = [];

        for (const bucket of BUCKETS) {
          const paths = await listAll(bucket);
          for (const path of paths) {
            const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
            if (error || !data) continue;
            const bytes = new Uint8Array(await data.arrayBuffer());
            files[`${bucket}/${path}`] = bytes;
            manifest.push({ bucket, path, size: bytes.byteLength });
          }
        }

        files["manifest.json"] = strToU8(
          JSON.stringify(
            {
              createdAt: new Date().toISOString(),
              userId: auth.user.id,
              buckets: BUCKETS,
              files: manifest,
            },
            null,
            2,
          ),
        );

        const zipped = zipSync(files, { level: 6 });
        const filename = `storage-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: "success",
          title: "Storage backup exported",
          message: `${manifest.length} file(s) across ${BUCKETS.length} bucket(s)`,
          link: "/backup",
          metadata: { action: "storage-export", fileCount: manifest.length },
        });

        // Workers don't allow Uint8Array directly in some cases; wrap in Blob.
        return new Response(new Blob([zipped as BlobPart], { type: "application/zip" }), {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${filename}"`,
          },
        });
      },

      // Import a previously exported storage zip and re-upload every file.
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let zipBytes: Uint8Array;
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File))
            return json({ message: "No file provided" }, { status: 400 });
          zipBytes = new Uint8Array(await file.arrayBuffer());
        } catch (e: any) {
          return json({ message: `Invalid upload: ${e?.message ?? e}` }, { status: 400 });
        }

        let entries: Record<string, Uint8Array>;
        try {
          entries = unzipSync(zipBytes);
        } catch (e: any) {
          return json({ message: `Invalid zip: ${e?.message ?? e}` }, { status: 400 });
        }

        const validBuckets = new Set<string>(BUCKETS);
        const results: { uploaded: number; skipped: number; errors: string[] } = {
          uploaded: 0,
          skipped: 0,
          errors: [],
        };

        for (const [name, bytes] of Object.entries(entries)) {
          if (name === "manifest.json") continue;
          const slash = name.indexOf("/");
          if (slash < 0) {
            results.skipped++;
            continue;
          }
          const bucket = name.slice(0, slash);
          const path = name.slice(slash + 1);
          if (!validBuckets.has(bucket)) {
            results.skipped++;
            continue;
          }

          const { error } = await supabaseAdmin.storage
            .from(bucket)
            .upload(path, bytes, { upsert: true, contentType: "application/octet-stream" });
          if (error) results.errors.push(`${bucket}/${path}: ${error.message}`);
          else results.uploaded++;
        }

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: results.errors.length ? "warning" : "success",
          title: "Storage backup imported",
          message: `Uploaded ${results.uploaded} file(s)${results.errors.length ? `, ${results.errors.length} error(s)` : ""}`,
          link: "/backup",
          metadata: { action: "storage-import", ...results },
        });

        return json({ status: results.errors.length ? "partial" : "completed", ...results });
      },
    },
  },
});
