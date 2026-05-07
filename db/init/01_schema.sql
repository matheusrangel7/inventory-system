CREATE DATABASE IF NOT EXISTS inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE inventory_db;

CREATE TABLE IF NOT EXISTS Users (
    user_id       INTEGER PRIMARY KEY AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('Gestor','Administrador') NOT NULL DEFAULT 'Gestor',
    approval_status ENUM('Pendente','Aprovado','Rejeitado') NOT NULL DEFAULT 'Pendente',
    is_active     BOOL NOT NULL DEFAULT TRUE,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Locations (
    location_id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    location_name    VARCHAR(100) NOT NULL UNIQUE,
    location_manager INTEGER,
    is_active        BOOL NOT NULL DEFAULT TRUE,
    FOREIGN KEY (location_manager) REFERENCES Users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Category (
    category_id   INTEGER PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(50) NOT NULL UNIQUE,
    is_active     BOOL NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Features (
    feature_id   INTEGER PRIMARY KEY AUTO_INCREMENT,
    feature_name VARCHAR(50) NOT NULL,
    feature_type ENUM('text','number','boolean','date') NOT NULL DEFAULT 'text',
    category_id  INTEGER NOT NULL,
    is_active    BOOL NOT NULL DEFAULT TRUE,
    FOREIGN KEY (category_id) REFERENCES Category(category_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Assets (
    asset_id         INTEGER PRIMARY KEY AUTO_INCREMENT,
    serial_number    VARCHAR(100) NOT NULL UNIQUE,
    category_id      INTEGER NOT NULL,
    location_id      INTEGER NOT NULL,
    assigned_to      VARCHAR(100),
    assigned_at      DATETIME,
    asset_state      ENUM('Bom Estado','Necessita Manutenção','Avariado','Para Abate') NOT NULL,
    date_of_register DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active        BOOL NOT NULL DEFAULT TRUE,
    FOREIGN KEY (category_id) REFERENCES Category(category_id),
    FOREIGN KEY (location_id) REFERENCES Locations(location_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Specs (
    spec_id    INTEGER PRIMARY KEY AUTO_INCREMENT,
    feature_id INTEGER NOT NULL,
    asset_id   INTEGER NOT NULL,
    spec_value TEXT NOT NULL,
    is_active  BOOL NOT NULL DEFAULT TRUE,
    FOREIGN KEY (feature_id) REFERENCES Features(feature_id),
    FOREIGN KEY (asset_id) REFERENCES Assets(asset_id),
    UNIQUE(feature_id, asset_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AuditLog (
    log_id     INTEGER PRIMARY KEY AUTO_INCREMENT,
    user_id    INTEGER,
    action     ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id  INTEGER NOT NULL,
    old_value  JSON,
    new_value  JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;