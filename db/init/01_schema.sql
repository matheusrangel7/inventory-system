CREATE TYPE user_role AS ENUM ('Gestor', 'Administrador');
CREATE TYPE reg_status_enum AS ENUM ('Pendente', 'Aprovado', 'Rejeitado');
CREATE TYPE feature_type_enum AS ENUM ('text', 'number', 'boolean', 'date');
CREATE TYPE asset_state_enum AS ENUM ('Bom Estado', 'Necessita Manutenção', 'Avariado', 'Para Abate');
CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE');

CREATE TABLE IF NOT EXISTS Users (
    user_id            SERIAL PRIMARY KEY,
    email              VARCHAR(255) NOT NULL UNIQUE,
    password_hash      VARCHAR(255) NOT NULL,
    role               user_role NOT NULL DEFAULT 'Gestor',
    registration_status reg_status_enum NOT NULL DEFAULT 'Pendente',
    registration_token  CHAR(64),
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Locations (
    location_id      SERIAL PRIMARY KEY,
    location_name    VARCHAR(100) NOT NULL UNIQUE,
    location_manager INTEGER,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (location_manager) REFERENCES Users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS Categories (
    category_id   SERIAL PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Features (
    feature_id   SERIAL PRIMARY KEY,
    feature_name VARCHAR(50) NOT NULL,
    feature_type feature_type_enum NOT NULL DEFAULT 'text',
    category_id  INTEGER NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id)
);

CREATE TABLE IF NOT EXISTS Assets (
    asset_id           SERIAL PRIMARY KEY,
    serial_number      VARCHAR(100) NOT NULL UNIQUE,
    category_id        INTEGER NOT NULL,
    location_id        INTEGER NOT NULL,
    assigned_to        VARCHAR(100),
    assigned_at        TIMESTAMP,
    asset_state        asset_state_enum NOT NULL,
    last_maintenance   DATE,
    maintenance_period INTEGER,
    date_of_register   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (location_id) REFERENCES Locations(location_id)
);

CREATE TABLE IF NOT EXISTS Specs (
    spec_id    SERIAL PRIMARY KEY,
    feature_id INTEGER NOT NULL,
    asset_id   INTEGER NOT NULL,
    spec_value TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (feature_id) REFERENCES Features(feature_id),
    FOREIGN KEY (asset_id) REFERENCES Assets(asset_id),
    UNIQUE(feature_id, asset_id)
);

CREATE TABLE IF NOT EXISTS AuditLogs (
    log_id     SERIAL PRIMARY KEY,
    user_id    INTEGER,
    origin     VARCHAR(100),
    action     audit_action NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id  INTEGER NOT NULL,
    old_value  JSONB,
    new_value  JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE SET NULL
);