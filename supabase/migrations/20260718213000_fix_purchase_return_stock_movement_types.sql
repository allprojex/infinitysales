-- Align purchase-return ledger entries with the lowercase stock movement convention.
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check CHECK (
    movement_type IN (
      'sale', 'sale_return', 'purchase_receipt', 'purchase_return',
      'purchase_return_reversal', 'adjustment', 'stock_take',
      'transfer_in', 'transfer_out', 'opening'
    )
  );

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.complete_purchase_return(uuid,uuid)'::regprocedure)
  INTO v_definition;
  EXECUTE replace(v_definition, '''PURCHASE_RETURN''', '''purchase_return''');

  SELECT pg_get_functiondef('public.reverse_purchase_return(uuid,uuid,text)'::regprocedure)
  INTO v_definition;
  v_definition := replace(v_definition, '''PURCHASE_RETURN_REVERSAL''', '''purchase_return_reversal''');
  EXECUTE v_definition;
END;
$$;
