-- ═══════════════════════════════════════════════════════════
-- Migration 022: Статус на плаќање на продажби
-- ═══════════════════════════════════════════════════════════

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'неплатено',
  ADD COLUMN IF NOT EXISTS paid_at DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_status_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check
      CHECK (payment_status IN ('неплатено', 'платено'));
  END IF;
END $$;

-- Продажби во готово / гратис се сметаат за платени на денот на продажба
UPDATE sales
SET payment_status = 'платено', paid_at = COALESCE(paid_at, sale_date)
WHERE payment_method IN ('готово', 'гратис') AND payment_status = 'неплатено';
