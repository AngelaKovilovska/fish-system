-- ═══════════════════════════════════════════════════════════
-- Migration 017: Add production_date to production_batches
-- ═══════════════════════════════════════════════════════════

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS production_date DATE DEFAULT CURRENT_DATE;

-- Backfill existing rows with the date from started_at
UPDATE production_batches
  SET production_date = started_at::date
  WHERE production_date IS NULL;
