ALTER TABLE public.ip_blocks
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz;
