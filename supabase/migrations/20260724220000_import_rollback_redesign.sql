-- Rollback redesign: support an immutable-ledger-safe Undo Import.
--
-- The prior rollback implementation tried to hard-delete stock_movements rows
-- (blocked by the stock_movements_immutable trigger, by design - the ledger
-- is append-only) and then hard-delete the product itself (blocked by the
-- stock_movements_product_id_fkey FK once the movement row survives). Both
-- failures were silently swallowed, so "Undo Import" could report success
-- while leaving an inserted product completely un-removed.
--
-- The new design never deletes or updates a stock_movements row - it always
-- posts an offsetting import_reversal movement instead - and archives
-- (is_active = false) rather than hard-deletes a rolled-back product. These
-- columns let a rollback be resumed/audited correctly:
--
-- categories_created: category ids this batch's commit created (not just
--   matched), so a later rollback knows exactly which categories are even
--   eligible for cleanup, without guessing from timestamps.
-- rollback_report: per-row outcome (restored / reversed_and_archived /
--   reversed_manual_review / failed) from the most recent rollback attempt,
--   so a retried rollback can skip rows already completed instead of
--   re-posting a duplicate reversal movement.
-- rolled_back_at: when the (possibly partial) rollback last ran.
ALTER TABLE public.product_import_batches
  ADD COLUMN IF NOT EXISTS categories_created jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rollback_report jsonb,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;
