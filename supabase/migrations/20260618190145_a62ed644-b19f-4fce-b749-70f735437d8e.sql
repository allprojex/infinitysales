ALTER TABLE public.product_import_batches
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'committed',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pending_rows jsonb,
  ADD COLUMN IF NOT EXISTS overwrite_fields jsonb,
  ADD COLUMN IF NOT EXISTS imported_by_name text;

DROP TRIGGER IF EXISTS set_pib_updated_at ON public.product_import_batches;
CREATE TRIGGER set_pib_updated_at
  BEFORE UPDATE ON public.product_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();