-- Utilizador administrador de teste
INSERT INTO Users (email, password_hash, role, registration_status)
VALUES ('admin@sistema.com', '$2b$12$XuQQOre8PDF6ZAYO0QZK2.tjqCK4eoZxHczLQ3hHnh7Tx7ft87r2.', 'Administrador', 'Aprovado')
ON CONFLICT (email) DO NOTHING;

-- Utilizador gestor de teste
INSERT INTO Users (email, password_hash, role, registration_status)
VALUES ('gestor1@sistema.com', '$2b$12$XuQQOre8PDF6ZAYO0QZK2.tjqCK4eoZxHczLQ3hHnh7Tx7ft87r2.', 'Gestor', 'Aprovado')
ON CONFLICT (email) DO NOTHING;

-- Sala de teste
INSERT INTO Locations (location_name, location_manager)
VALUES ('Laboratório de Informática 1', 2)
ON CONFLICT (location_name) DO NOTHING;

-- Categoria de teste: Computador
INSERT INTO Categories (category_name) 
VALUES ('Computador')
ON CONFLICT (category_name) DO NOTHING;

-- Features da categoria Computador
INSERT INTO Features (feature_name, feature_type, category_id)
VALUES
    ('RAM (GB)',         'number',  1),
    ('Sistema Operativo', 'text',    1),
    ('Disco (GB)',        'number',  1),
    ('Data de Garantia',   'date',    1),
    ('SSD',              'boolean', 1)
ON CONFLICT DO NOTHING;

-- Asset de teste
INSERT INTO Assets (serial_number, category_id, location_id, asset_state)
VALUES ('PC-LAB1-001', 1, 1, 'Bom Estado')
ON CONFLICT (serial_number) DO NOTHING;