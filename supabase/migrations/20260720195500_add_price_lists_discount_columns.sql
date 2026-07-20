-- Price Lists fix: the live price_lists table has no columns for pricing
-- type, discount value, or default-list flag — every field the "New Price
-- List" dialog (price-lists.tsx) has always collected. Creating any price
-- list currently fails outright ("Could not find the 'discount_value'
-- column"). Purely additive: three new columns with safe defaults, no
-- existing data touched.
ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'percentage_discount',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
