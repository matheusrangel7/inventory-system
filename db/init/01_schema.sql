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
    mfa_recovery_code_hash VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_token_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mfa_reconfigurations (
    reconfiguration_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    pending_totp_secret VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_admin_transfer (
    transfer_id SERIAL PRIMARY KEY,
    initiated_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    target_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
    resolved_at TIMESTAMPTZ,
    CHECK (status IN ('Pendente', 'Cancelada', 'Expirada', 'Concluída')),
    CHECK (initiated_by <> target_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_admin_transfer_singleton
ON pending_admin_transfer ((true))
WHERE status = 'Pendente';

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

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabelas auxiliares usadas em filtros, joins e listagens
CREATE INDEX IF NOT EXISTS idx_users_active_role
    ON users (is_active, role);

CREATE INDEX IF NOT EXISTS idx_locations_active_manager
    ON locations (is_active, location_manager_id);

CREATE INDEX IF NOT EXISTS idx_categories_active_name
    ON categories (is_active, category_name);

CREATE INDEX IF NOT EXISTS idx_features_active_category
    ON features (category_id, is_active);

-- filtros principais e ordenação/paginação dos ativos
CREATE INDEX IF NOT EXISTS idx_assets_active_registered
    ON assets (registered_at DESC, asset_id DESC)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_assets_active_category
    ON assets (category_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_assets_active_location
    ON assets (location_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_assets_active_state
    ON assets (asset_state)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_assets_active_assigned
    ON assets (assigned_to)
    WHERE is_active = TRUE;

-- Specs/características dos ativos.
CREATE INDEX IF NOT EXISTS idx_asset_specs_active_asset
    ON asset_specs (asset_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_asset_specs_active_feature_asset
    ON asset_specs (feature_id, asset_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_asset_specs_content_gin
    ON asset_specs USING gin (content);

-- Pesquisa textual com ILIKE/%termo%.
CREATE INDEX IF NOT EXISTS idx_assets_serial_trgm
    ON assets USING gin (serial_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assets_assigned_trgm
    ON assets USING gin (assigned_to gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
    ON categories USING gin (category_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_name_trgm
    ON locations USING gin (location_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_features_name_trgm
    ON features USING gin (feature_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_specs_content_text_trgm
    ON asset_specs USING gin ((content::text) gin_trgm_ops);
