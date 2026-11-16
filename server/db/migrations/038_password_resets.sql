-- 038: Заборавена лозинка — еднократен код испратен на е-пошта (важи 15 минути, најмногу 5 обиди).
CREATE TABLE IF NOT EXISTS password_resets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
