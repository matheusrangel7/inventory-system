CREATE TYPE user_role_enum AS ENUM ('Gestor', 'Administrador');

CREATE TYPE registration_status_enum AS ENUM ('Pendente', 'Concluído');

CREATE TYPE feature_type_enum AS ENUM ('text', 'number', 'boolean', 'date');

CREATE TYPE asset_state_enum AS ENUM (
    'Bom Estado',
    'Necessita Manutenção',
    'Avariado',
    'Para Abate'
);

CREATE TYPE audit_action_enum AS ENUM ('INSERT', 'UPDATE', 'DELETE');

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'Gestor',
    registration_status registration_status_enum NOT NULL DEFAULT 'Pendente',
    registration_token_hash CHAR(64),
    registration_token_expires_at TIMESTAMPTZ,
    totp_secret VARCHAR(64),
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_address INET,
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS locations (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL UNIQUE,
    location_manager_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (location_manager_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS features (
    feature_id SERIAL PRIMARY KEY,
    feature_name VARCHAR(50) NOT NULL,
    feature_type feature_type_enum NOT NULL DEFAULT 'text',
    category_id INTEGER NOT NULL,
    is_multiple BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (feature_name, category_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS assets (
    asset_id SERIAL PRIMARY KEY,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    category_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMPTZ,
    asset_state asset_state_enum NOT NULL,
    last_maintenance DATE,
    maintenance_period_months INTEGER CHECK (maintenance_period_months > 0),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (
        (
            assigned_to IS NULL
            AND assigned_at IS NULL
        )
        OR (
            assigned_to IS NOT NULL
            AND assigned_at IS NOT NULL
        )
    ),
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS asset_specs (
    spec_id SERIAL PRIMARY KEY,
    feature_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    content JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(feature_id, asset_id),
    FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE RESTRICT,
    FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INTEGER,
    origin VARCHAR(100) NOT NULL DEFAULT 'utilizador',
    action audit_action_enum NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);