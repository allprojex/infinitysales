-- Bank Reconciliation UI has always sent an account type field; the column never existed.
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'current';

NOTIFY pgrst, 'reload schema';
