-- Cash Management fix: cash_sessions has no column for the "Terminal /
-- Register" field the frontend (cash-management.tsx) has always collected
-- and displayed. Purely additive: one new nullable text column, no existing
-- data touched, no constraint changes.
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS terminal text;

NOTIFY pgrst, 'reload schema';
