-- Product import: content-based duplicate-run protection.
--
-- The existing per-batch status check ('committed' blocks re-committing the
-- SAME batch id) only guards against double-clicking Commit on one preview.
-- It does nothing if the same file is uploaded again days later, generating
-- a brand new batch id - which, now that imports add stock rather than
-- replace it, would silently double the stock addition. content_hash is a
-- deterministic digest of the normalized row set (name+stock+cost+price+
-- expiry, sorted), computed at preview time, so a second upload of
-- byte-identical import data can be detected and blocked at commit time
-- regardless of filename or batch id.

ALTER TABLE public.product_import_batches
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz;

CREATE INDEX IF NOT EXISTS product_import_batches_content_hash_idx
  ON public.product_import_batches(user_id, content_hash)
  WHERE status = 'committed';
