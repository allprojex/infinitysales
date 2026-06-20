
-- IP BLOCKS
CREATE TABLE public.ip_blocks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual_block',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ip_address)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_blocks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ip_blocks_id_seq TO authenticated;
GRANT ALL ON public.ip_blocks TO service_role;
ALTER TABLE public.ip_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ip blocks" ON public.ip_blocks FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- GENERATED REPORTS
CREATE TABLE public.generated_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  period TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  file_url TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gen_rep_user_idx ON public.generated_reports(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_reports TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.generated_reports_id_seq TO authenticated;
GRANT ALL ON public.generated_reports TO service_role;
ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gen reports" ON public.generated_reports FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_gen_reports_updated BEFORE UPDATE ON public.generated_reports FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- BACKUP RECORDS
CREATE TABLE public.backup_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  table_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX backup_user_idx ON public.backup_records(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_records TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.backup_records_id_seq TO authenticated;
GRANT ALL ON public.backup_records TO service_role;
ALTER TABLE public.backup_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own backups" ON public.backup_records FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- RESTORE HISTORY
CREATE TABLE public.restore_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT,
  tables_restored TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed',
  rows_restored INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX restore_user_idx ON public.restore_history(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restore_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.restore_history_id_seq TO authenticated;
GRANT ALL ON public.restore_history TO service_role;
ALTER TABLE public.restore_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own restore history" ON public.restore_history FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- PRODUCT IMPORT BATCHES
CREATE TABLE public.product_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT,
  import_mode TEXT NOT NULL DEFAULT 'insert',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX import_batches_user_idx ON public.product_import_batches(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_batches TO authenticated;
GRANT ALL ON public.product_import_batches TO service_role;
ALTER TABLE public.product_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own import batches" ON public.product_import_batches FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
