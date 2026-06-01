ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_token_hash CHAR(64),
ADD COLUMN IF NOT EXISTS registration_token_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS pending_admin_transfer (
    transfer_id SERIAL PRIMARY KEY,
    initiated_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    target_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (initiated_by <> target_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_admin_transfer_singleton
ON pending_admin_transfer ((true));

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_registration_token_hash
ON users (registration_token_hash)
WHERE registration_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_effective_admin
ON users ((true))
WHERE role = 'Administrador'
  AND registration_status = 'Concluído'
  AND is_active = TRUE;
