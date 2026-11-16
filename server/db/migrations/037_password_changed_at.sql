-- 037: По промена на лозинка, старите најави (токени) престануваат да важат.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
