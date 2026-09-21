-- ══════════════════════════════════════════════════
-- 025: Продажби во готово / гратис се без ДДВ
-- ══════════════════════════════════════════════════
-- Постоечките продажби со начин на плаќање „готово“ или „гратис“ се
-- пресметуваат повторно: ДДВ 0%, ДДВ износ 0, вкупно = основица.
-- Се извршува само еднаш (flag); идемпотентна (UPDATE е безопасен и повторно).

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '025_no_vat_cash_sales') THEN
    RETURN;
  END IF;
  INSERT INTO _migration_flags (flag_name) VALUES ('025_no_vat_cash_sales');

  UPDATE sales
  SET vat_rate = 0, vat_amount = 0, total = subtotal, updated_at = NOW()
  WHERE payment_method IN ('готово', 'гратис')
    AND (COALESCE(vat_amount, 0) <> 0 OR COALESCE(vat_rate, 0) <> 0);
END $$;
