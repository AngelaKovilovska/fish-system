-- Rename role 'worker' → 'operator'
-- 1. Update existing users
UPDATE users SET role = 'operator' WHERE role = 'worker';

-- 2. Drop old CHECK constraint and add new one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'operator'));

-- 3. Change default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'operator';
