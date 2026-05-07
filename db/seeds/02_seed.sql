-- Para correr: docker compose exec db mysql -u app_user -p inventory_db < db/seeds/02_seed.sql

USE inventory_db;

-- Utilizador administrador de teste
-- Password: "admin123" (hash bcrypt — gerar com Python: bcrypt.hashpw(b"admin123", bcrypt.gensalt()))
INSERT IGNORE INTO Users (username, password_hash, role, approval_status)
VALUES ('admin', '$2b$12$XuQQOre8PDF6ZAYO0QZK2.tjqCK4eoZxHczLQ3hHnh7Tx7ft87r2.', 'Administrador', 'Aprovado');

-- Utilizador gestor de teste
INSERT IGNORE INTO Users (username, password_hash, role, approval_status)
VALUES ('gestor_lab1', '$2b$12$XuQQOre8PDF6ZAYO0QZK2.tjqCK4eoZxHczLQ3hHnh7Tx7ft87r2.', 'Gestor', 'Aprovado');

-- Sala de teste
INSERT IGNORE INTO Locations (location_name, location_manager)
VALUES ('Laboratório de Informática 1', 2);

-- Categoria de teste: Computador
INSERT IGNORE INTO Category (category_name) VALUES ('Computador');

-- Features da categoria Computador
INSERT IGNORE INTO Features (feature_name, feature_type, category_id)
VALUES
    ('RAM (GB)',            'number',  1),
    ('Sistema Operativo',  'text',    1),
    ('Disco (GB)',          'number',  1),
    ('Data de Garantia',   'date',    1),
    ('SSD',                'boolean', 1);

-- Asset de teste
INSERT IGNORE INTO Assets (serial_number, category_id, location_id, asset_state)
VALUES ('PC-LAB1-001', 1, 1, 'Bom Estado');