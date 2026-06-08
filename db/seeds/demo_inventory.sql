BEGIN;

INSERT INTO locations (location_name, is_active)
VALUES
    ('Sala 1.01', TRUE),
    ('Laboratório 2.03', TRUE),
    ('Auditório A', TRUE)
ON CONFLICT (location_name) DO UPDATE
SET is_active = EXCLUDED.is_active;

INSERT INTO categories (category_name, is_active)
VALUES
    ('Computador', TRUE),
    ('Monitor', TRUE),
    ('Projetor', TRUE)
ON CONFLICT (category_name) DO UPDATE
SET is_active = EXCLUDED.is_active;

INSERT INTO features (
    feature_name,
    feature_type,
    category_id,
    is_multiple,
    is_active
)
SELECT
    seed.feature_name,
    seed.feature_type::feature_type_enum,
    category.category_id,
    seed.is_multiple,
    TRUE
FROM (
    VALUES
        ('Computador', 'Fabricante', 'text', FALSE),
        ('Computador', 'Modelo', 'text', FALSE),
        ('Computador', 'Processador', 'text', FALSE),
        ('Computador', 'Memória RAM (GB)', 'number', FALSE),
        ('Computador', 'Armazenamento (GB)', 'number', FALSE),
        ('Computador', 'Sistema Operativo', 'text', FALSE),
        ('Monitor', 'Fabricante', 'text', FALSE),
        ('Monitor', 'Modelo', 'text', FALSE),
        ('Monitor', 'Tamanho (polegadas)', 'number', FALSE),
        ('Monitor', 'Resolução', 'text', FALSE),
        ('Monitor', 'Entradas', 'text', TRUE),
        ('Projetor', 'Fabricante', 'text', FALSE),
        ('Projetor', 'Modelo', 'text', FALSE),
        ('Projetor', 'Resolução', 'text', FALSE),
        ('Projetor', 'Luminosidade (ANSI lúmens)', 'number', FALSE)
) AS seed(category_name, feature_name, feature_type, is_multiple)
JOIN categories AS category
    ON category.category_name = seed.category_name
ON CONFLICT (feature_name, category_id) DO UPDATE
SET
    feature_type = EXCLUDED.feature_type,
    is_multiple = EXCLUDED.is_multiple,
    is_active = TRUE;

INSERT INTO assets (
    serial_number,
    category_id,
    location_id,
    asset_state,
    last_maintenance,
    maintenance_period_months,
    is_active
)
SELECT
    seed.serial_number,
    category.category_id,
    location.location_id,
    seed.asset_state::asset_state_enum,
    seed.last_maintenance::date,
    seed.maintenance_period_months,
    TRUE
FROM (
    VALUES
        ('DEMO-PC-001', 'Computador', 'Laboratório 2.03', 'Bom Estado', '2026-01-15', 12),
        ('DEMO-PC-002', 'Computador', 'Sala 1.01', 'Necessita Manutenção', '2025-04-10', 12),
        ('DEMO-MON-001', 'Monitor', 'Laboratório 2.03', 'Bom Estado', '2026-02-01', 24),
        ('DEMO-MON-002', 'Monitor', 'Sala 1.01', 'Bom Estado', '2026-02-01', 24),
        ('DEMO-PROJ-001', 'Projetor', 'Auditório A', 'Bom Estado', '2025-12-05', 12)
) AS seed(
    serial_number,
    category_name,
    location_name,
    asset_state,
    last_maintenance,
    maintenance_period_months
)
JOIN categories AS category
    ON category.category_name = seed.category_name
JOIN locations AS location
    ON location.location_name = seed.location_name
ON CONFLICT (serial_number) DO UPDATE
SET
    category_id = EXCLUDED.category_id,
    location_id = EXCLUDED.location_id,
    asset_state = EXCLUDED.asset_state,
    last_maintenance = EXCLUDED.last_maintenance,
    maintenance_period_months = EXCLUDED.maintenance_period_months,
    is_active = TRUE;

INSERT INTO asset_specs (feature_id, asset_id, content, is_active)
SELECT
    feature.feature_id,
    asset.asset_id,
    seed.content,
    TRUE
FROM (
    VALUES
        ('DEMO-PC-001', 'Computador', 'Fabricante', '"Dell"'::jsonb),
        ('DEMO-PC-001', 'Computador', 'Modelo', '"OptiPlex 7010"'::jsonb),
        ('DEMO-PC-001', 'Computador', 'Processador', '"Intel Core i7-13700"'::jsonb),
        ('DEMO-PC-001', 'Computador', 'Memória RAM (GB)', '32'::jsonb),
        ('DEMO-PC-001', 'Computador', 'Armazenamento (GB)', '1000'::jsonb),
        ('DEMO-PC-001', 'Computador', 'Sistema Operativo', '"Ubuntu 24.04 LTS"'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Fabricante', '"HP"'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Modelo', '"ProDesk 400 G7"'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Processador', '"Intel Core i5-10500"'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Memória RAM (GB)', '16'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Armazenamento (GB)', '512'::jsonb),
        ('DEMO-PC-002', 'Computador', 'Sistema Operativo', '"Windows 11 Education"'::jsonb),
        ('DEMO-MON-001', 'Monitor', 'Fabricante', '"Dell"'::jsonb),
        ('DEMO-MON-001', 'Monitor', 'Modelo', '"P2422H"'::jsonb),
        ('DEMO-MON-001', 'Monitor', 'Tamanho (polegadas)', '24'::jsonb),
        ('DEMO-MON-001', 'Monitor', 'Resolução', '"1920x1080"'::jsonb),
        ('DEMO-MON-001', 'Monitor', 'Entradas', '["HDMI", "DisplayPort"]'::jsonb),
        ('DEMO-MON-002', 'Monitor', 'Fabricante', '"LG"'::jsonb),
        ('DEMO-MON-002', 'Monitor', 'Modelo', '"24MP400"'::jsonb),
        ('DEMO-MON-002', 'Monitor', 'Tamanho (polegadas)', '24'::jsonb),
        ('DEMO-MON-002', 'Monitor', 'Resolução', '"1920x1080"'::jsonb),
        ('DEMO-MON-002', 'Monitor', 'Entradas', '["HDMI", "VGA"]'::jsonb),
        ('DEMO-PROJ-001', 'Projetor', 'Fabricante', '"Epson"'::jsonb),
        ('DEMO-PROJ-001', 'Projetor', 'Modelo', '"EB-L260F"'::jsonb),
        ('DEMO-PROJ-001', 'Projetor', 'Resolução', '"1920x1080"'::jsonb),
        ('DEMO-PROJ-001', 'Projetor', 'Luminosidade (ANSI lúmens)', '4600'::jsonb)
) AS seed(serial_number, category_name, feature_name, content)
JOIN assets AS asset
    ON asset.serial_number = seed.serial_number
JOIN categories AS category
    ON category.category_name = seed.category_name
    AND category.category_id = asset.category_id
JOIN features AS feature
    ON feature.category_id = category.category_id
    AND feature.feature_name = seed.feature_name
ON CONFLICT (feature_id, asset_id) DO UPDATE
SET
    content = EXCLUDED.content,
    is_active = TRUE;

COMMIT;
