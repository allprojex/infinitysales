-- "Other" expense category needs a free-text field for what the expense actually is.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_other text;

NOTIFY pgrst, 'reload schema';
