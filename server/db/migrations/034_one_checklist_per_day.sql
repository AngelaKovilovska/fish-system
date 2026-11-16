-- 034: Една дневна чеклиста по датум. Индексот се прави само ако нема постоечки дупликати
-- (ако има, ништо не се брише — апликацијата и пресметката на риби веќе го земаат последниот запис за денот).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_records GROUP BY date HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_records_date ON daily_records (date);
  END IF;
END $$;
