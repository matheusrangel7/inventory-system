INSERT INTO users (email, password_hash, role, registration_status)
VALUES (
    'admin@universidade.pt',
    '$2b$12$XuQQOre8PDF6ZAYO0QZK2.tjqCK4eoZxHczLQ3hHnh7Tx7ft87r2.',
    'Administrador',
    'Concluído'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO locations (location_name)
VALUES ('Laboratório de Informática 6.10')
ON CONFLICT (location_name) DO NOTHING;

INSERT INTO categories (category_name)
VALUES ('Computador')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO features (feature_name, feature_type, category_id)
VALUES
    ('RAM (GB)',           'number',  1),
    ('Sistema Operativo',  'text',    1),
    ('Disco (GB)',          'number',  1),
    ('SSD',                'boolean', 1),
    ('Data de Garantia',   'date',    1)
ON CONFLICT (feature_name, category_id) DO NOTHING;
