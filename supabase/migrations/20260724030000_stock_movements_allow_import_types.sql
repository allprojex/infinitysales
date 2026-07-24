-- The product-import commit/rollback flow tags stock movements with
-- movement_type 'import' (opening stock added by a bulk import) and
-- 'import_reversal' (rollback of that stock). Neither value was ever added
-- to stock_movements_movement_type_check, so every such insert violated the
-- constraint and silently failed - the bulk import UI reported "success" for
-- rows whose stock was never actually applied. Add both values; this is
-- additive only, no existing rows or behavior change for other movement
-- types.

ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'sale'::text,
    'sale_return'::text,
    'purchase_receipt'::text,
    'purchase_return'::text,
    'purchase_return_reversal'::text,
    'adjustment'::text,
    'stock_take'::text,
    'transfer_in'::text,
    'transfer_out'::text,
    'opening'::text,
    'import'::text,
    'import_reversal'::text
  ]));
