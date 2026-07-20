-- Central-warehouse model + insufficient-stock guard for create_sale_atomic.
--
-- Two independent fixes to the ISSUE-008 atomic-sale function
-- (20260720150605_create_sale_atomic.sql):
--
-- 1. Sales Rule: "where a sale has no explicitly selected warehouse, Champion
--    Mart (the account's central/is_default warehouse) is used." Previously,
--    an unscoped sale (v_warehouse_id IS NULL) decremented products.stock
--    but wrote no stock_movements row at all. products.stock is
--    reconciliation's fallback source of truth, so the *balance math* was
--    already correct (Champion Mart's balance is derived as products.stock
--    minus every other warehouse — see -stock-helpers.ts's
--    CENTRAL_WAREHOUSE_LEDGER_BACKED compatibility layer), but it left no
--    ledger trail for what is conceptually a real movement. This function
--    now always resolves an effective warehouse (explicit selection, or the
--    account's is_default warehouse) and always writes one stock_movements
--    row for it — matching how Product Transfer and Purchase Receiving
--    already behave, and reducing what a future backfill-and-flip to a
--    fully ledger-backed Champion Mart would need to reconcile.
--
-- 2. Genuine pre-existing gap, independent of the Champion Mart work: the
--    function never checked that the effective warehouse actually held
--    enough stock before decrementing — it silently floored products.stock
--    at 0 and let a warehouse's computed balance go negative instead of
--    rejecting the sale. Fixed by raising an exception (surfaced as a clean
--    error by sales.ts, same as any other failure in this transaction)
--    before any write happens for that item, using the same balance
--    definitions -stock-helpers.ts uses (derived for the central warehouse,
--    plain ledger sum + single-product fallback for a branch).
--
-- Purely additive: replaces the function body only, same signature, same
-- callers, no schema change.
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_user_id uuid,
  p_sale jsonb,
  p_credit_amount numeric
)
RETURNS public.sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_cost numeric;
  v_warehouse_id uuid;
  v_effective_warehouse_id uuid;
  v_central_warehouse_id uuid;
  v_available numeric;
  v_movement_balance numeric;
  v_movement_count int;
  v_product_stock numeric;
  v_product_warehouse_id uuid;
  v_balance_after numeric;
  v_customer_id uuid;
  v_total numeric;
BEGIN
  INSERT INTO public.sales (
    user_id, reference, customer_id, branch_id, warehouse_id, cash_session_id,
    channel, status, payment_status, payment_method,
    subtotal, tax, discount, total, paid, change_due, items, notes, sold_at
  ) VALUES (
    p_user_id,
    p_sale->>'reference',
    NULLIF(p_sale->>'customer_id', '')::uuid,
    NULLIF(p_sale->>'branch_id', '')::uuid,
    NULLIF(p_sale->>'warehouse_id', '')::uuid,
    NULLIF(p_sale->>'cash_session_id', '')::uuid,
    COALESCE(p_sale->>'channel', 'pos'),
    COALESCE(p_sale->>'status', 'completed'),
    COALESCE(p_sale->>'payment_status', 'paid'),
    p_sale->>'payment_method',
    COALESCE((p_sale->>'subtotal')::numeric, 0),
    COALESCE((p_sale->>'tax')::numeric, 0),
    COALESCE((p_sale->>'discount')::numeric, 0),
    COALESCE((p_sale->>'total')::numeric, 0),
    COALESCE((p_sale->>'paid')::numeric, 0),
    COALESCE((p_sale->>'change_due')::numeric, 0),
    COALESCE(p_sale->'items', '[]'::jsonb),
    p_sale->>'notes',
    COALESCE((p_sale->>'sold_at')::timestamptz, now())
  ) RETURNING * INTO v_sale;

  v_warehouse_id := v_sale.warehouse_id;

  -- Sales Rule: no explicit warehouse -> Champion Mart (the account's
  -- is_default warehouse) is the effective one.
  SELECT uuid_id INTO v_central_warehouse_id
  FROM public.warehouses
  WHERE user_id = p_user_id AND is_default = true
  LIMIT 1;
  IF v_central_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No central warehouse is configured for this account (no warehouse is marked as default).';
  END IF;
  v_effective_warehouse_id := COALESCE(v_warehouse_id, v_central_warehouse_id);

  -- decrementProductStock(): only completed sales move stock.
  IF v_sale.status = 'completed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb))
    LOOP
      v_product_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id'), '')::uuid;
      v_quantity := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      IF v_product_id IS NULL OR v_quantity <= 0 THEN CONTINUE; END IF;
      v_cost := COALESCE((v_item->>'cost')::numeric, 0);

      SELECT stock, warehouse_id INTO v_product_stock, v_product_warehouse_id
      FROM public.products WHERE id = v_product_id AND user_id = p_user_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_product_id;
      END IF;

      -- Insufficient-stock guard (new), two independent checks:
      --
      -- 1. Company-total: products.stock must itself cover the sale. This
      --    catches data drift a branch-only check would miss — e.g. a
      --    product whose products.stock is 0 but a branch's ledger still
      --    shows a positive balance (exactly the pre-existing "2 Keys
      --    Whiskey"/"8Pm Large" drift this audit's reconciliation report
      --    found: Rose Andoh Mart ledger = 2, products.stock = 0). Without
      --    this check, selling "from" that branch would pass a branch-only
      --    check while the company owns none of it.
      -- 2. Effective-warehouse: the specific warehouse (central, DERIVED as
      --    products.stock minus every other warehouse's ledger balance,
      --    mirroring -stock-helpers.ts's centralWarehouseBalance() exactly;
      --    or a branch, a plain ledger sum with the same single-product
      --    fallback warehouseBalance() uses) must also cover the sale.
      IF COALESCE(v_product_stock, 0) < v_quantity THEN
        RAISE EXCEPTION 'Insufficient company-wide stock for product %: total %, requested %',
          v_product_id, v_product_stock, v_quantity;
      END IF;

      IF v_effective_warehouse_id = v_central_warehouse_id THEN
        SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
        FROM public.stock_movements
        WHERE user_id = p_user_id AND product_id = v_product_id
          AND warehouse_id IS NOT NULL AND warehouse_id <> v_central_warehouse_id;
        v_available := COALESCE(v_product_stock, 0) - v_movement_balance;
      ELSE
        SELECT COALESCE(sum(quantity), 0), count(*) INTO v_movement_balance, v_movement_count
        FROM public.stock_movements
        WHERE user_id = p_user_id AND product_id = v_product_id
          AND warehouse_id = v_effective_warehouse_id;
        IF v_movement_count = 0 THEN
          IF v_product_warehouse_id IS NOT DISTINCT FROM v_effective_warehouse_id THEN
            v_movement_balance := COALESCE(v_product_stock, 0);
          ELSE
            v_movement_balance := 0;
          END IF;
        END IF;
        v_available := v_movement_balance;
      END IF;

      IF v_available < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %: available %, requested %',
          v_product_id, v_available, v_quantity;
      END IF;

      -- adjustProductStock(): plain subtraction, no floor. The guard above
      -- already guarantees this can't go negative; silently clamping to 0
      -- here would hide it if that guarantee were ever violated by a future
      -- change, instead of surfacing a visibly wrong (negative) value.
      UPDATE public.products
      SET stock = COALESCE(v_product_stock, 0) - v_quantity
      WHERE id = v_product_id;

      -- recordStockMovement(): always recorded now, against the effective
      -- warehouse (central or branch) — never a null warehouse_id.
      SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
      FROM public.stock_movements
      WHERE user_id = p_user_id AND product_id = v_product_id AND warehouse_id = v_effective_warehouse_id;
      v_balance_after := v_movement_balance - v_quantity;
      INSERT INTO public.stock_movements(
        user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
        balance_after, reference_type, reference_id, reason, created_by
      ) VALUES (
        p_user_id, v_product_id, v_effective_warehouse_id, 'sale', -v_quantity, v_cost,
        v_balance_after, 'sale', v_sale.id, 'Sale completed', p_user_id
      );
    END LOOP;
  END IF;

  v_customer_id := v_sale.customer_id;
  v_total := COALESCE(v_sale.total, 0);

  -- updateCustomerSpend(): only completed sales count toward spend.
  IF v_customer_id IS NOT NULL AND v_total > 0 AND v_sale.status = 'completed' THEN
    UPDATE public.customers
    SET total_spend = COALESCE(total_spend, 0) + v_total
    WHERE user_id = p_user_id AND uuid_id = v_customer_id;
  END IF;

  -- recordCustomerReceivable(): status-independent, matching the original
  -- (a pending/unpaid sale can still charge a receivable). p_credit_amount
  -- is pre-computed in TypeScript by the existing, unchanged
  -- creditChargeAmount() — a pure function of already-known values, not
  -- worth re-deriving in SQL.
  IF v_customer_id IS NOT NULL AND p_credit_amount > 0 THEN
    INSERT INTO public.customer_credits(user_id, customer_id, type, amount, reference, notes)
    VALUES (
      p_user_id, v_customer_id, 'charge', p_credit_amount,
      COALESCE(v_sale.reference, v_sale.id::text),
      'Sale ' || COALESCE(v_sale.reference, v_sale.id::text)
    );
  END IF;

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(uuid, jsonb, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
