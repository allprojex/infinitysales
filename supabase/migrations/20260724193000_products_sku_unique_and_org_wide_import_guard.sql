-- Production hardening, part 1: organization-wide SKU uniqueness.
--
-- The shared-catalog import fix (see products.import.preview.ts/commit.ts)
-- now matches SKU across every account's products, not just the uploader's
-- own. That closes the duplicate-on-insert bug for normal imports, but two
-- concurrent commits could still both pass the application-level "does this
-- SKU already exist" check before either has written its row, and insert two
-- products with the same SKU. A database-level constraint is the only thing
-- that can't be raced.
--
-- Scoped to lower(trim(sku)) to match the app's own normalizeForMatch()
-- comparison (case-insensitive, whitespace-trimmed), and partial (WHERE sku
-- IS NOT NULL AND trim(sku) <> '') because ~42% of existing products have no
-- SKU at all - a plain UNIQUE(sku) would either reject every blank-SKU
-- product outright or require coalescing to a sentinel, neither of which is
-- the actual business rule (many products legitimately have no SKU).
--
-- Verified before writing this migration: 0 duplicate groups today under
-- lower(trim(sku)) grouping (773 products, 3 uploaders), so this cannot fail
-- against current data. Product *names* are deliberately NOT made unique
-- here - 16 existing duplicate-name groups already exist, and a shared name
-- is not the same thing as a shared identity (see matchExistingProduct's
-- SKU/barcode-first priority).
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_normalized_idx
  ON public.products (lower(trim(sku)))
  WHERE sku IS NOT NULL AND trim(sku) <> '';

-- Production hardening, part 2: organization-wide import content-hash guard.
--
-- product_import_batches.content_hash lets commit detect "this exact file
-- (same products/quantities/prices/expiry) was already committed" - but the
-- existing index was scoped (user_id, content_hash), matching the
-- application code's old per-uploader duplicate check. Now that the check
-- itself is organization-wide (any committed batch, not just this caller's
-- own), add the matching index shape. The old per-user index is left in
-- place rather than dropped - it's redundant now but harmless, and nothing
-- else depends on it being removed.
CREATE INDEX IF NOT EXISTS product_import_batches_content_hash_org_idx
  ON public.product_import_batches (content_hash)
  WHERE status = 'committed';
