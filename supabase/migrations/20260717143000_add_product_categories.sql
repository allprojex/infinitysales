-- Product categories are shared by the system-wide product catalogue.
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_ci_uidx
  ON public.product_categories (lower(btrim(name)));

DROP TRIGGER IF EXISTS product_categories_updated ON public.product_categories;
CREATE TRIGGER product_categories_updated
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated view product categories" ON public.product_categories;
CREATE POLICY "authenticated view product categories"
  ON public.product_categories FOR SELECT TO authenticated USING (true);

INSERT INTO public.product_categories (name, description)
VALUES
  ('Household Items', 'Household supplies and general domestic items'),
  ('Food Products', 'Food and grocery products'),
  ('Toiletries', 'Personal hygiene and toiletry products'),
  ('Beverages', 'Drinks and beverage products'),
  ('Electronics', 'Electronic products and accessories'),
  ('Stationery', 'Office and school stationery'),
  ('Pharmaceuticals', 'Pharmaceutical and healthcare products'),
  ('Other', 'Products not assigned to another category')
ON CONFLICT (lower(btrim(name))) DO NOTHING;

-- Preserve useful legacy category names as custom categories before backfilling.
INSERT INTO public.product_categories (name, description)
SELECT DISTINCT btrim(p.category), 'Imported from existing product data'
FROM public.products p
WHERE p.category IS NOT NULL AND btrim(p.category) <> ''
ON CONFLICT (lower(btrim(name))) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid;

UPDATE public.products p
SET category_id = c.id
FROM public.product_categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL
  AND lower(btrim(p.category)) = lower(btrim(c.name));

UPDATE public.products p
SET category_id = c.id
FROM public.product_categories c
WHERE p.category_id IS NULL AND lower(c.name) = 'other';

ALTER TABLE public.products ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);

-- Defensive compatibility for trusted background jobs and legacy imports. The
-- public product API still requires an explicit category selection.
CREATE OR REPLACE FUNCTION public.tg_products_default_category()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    IF NEW.category IS NOT NULL AND btrim(NEW.category) <> '' THEN
      SELECT id INTO NEW.category_id FROM public.product_categories
      WHERE lower(btrim(name)) = lower(btrim(NEW.category)) LIMIT 1;
    END IF;
    IF NEW.category_id IS NULL THEN
      SELECT id INTO NEW.category_id FROM public.product_categories
      WHERE lower(name) = 'other' LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_default_category ON public.products;
CREATE TRIGGER products_default_category
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_products_default_category();

COMMENT ON COLUMN public.products.category IS
  'Deprecated legacy label. category_id is the authoritative product category reference.';
