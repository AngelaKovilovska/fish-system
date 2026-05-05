-- Migration 012: Add water exchange tracking field
-- Records how much water was exchanged (in cubic meters) on a given day
-- This is optional - only filled in when water exchange actually occurred

ALTER TABLE water_control ADD COLUMN IF NOT EXISTS water_exchange_m3 DECIMAL DEFAULT NULL;
