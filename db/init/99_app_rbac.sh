#!/bin/sh
set -eu

: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

if [ "$APP_DB_USER" = "$POSTGRES_USER" ]; then
    echo "APP_DB_USER must be different from POSTGRES_USER." >&2
    exit 1
fi

psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -v app_db_user="$APP_DB_USER" \
    -v app_db_password="$APP_DB_PASSWORD" \
    -v db_name="$POSTGRES_DB" <<'EOSQL'
\o /dev/null
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    :'app_db_user',
    :'app_db_password'
)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = :'app_db_user'
);
\gexec
\o

ALTER ROLE :"app_db_user"
    WITH LOGIN PASSWORD :'app_db_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

REVOKE CONNECT, TEMPORARY ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_db_user";

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE USAGE ON TYPE
    user_role_enum,
    registration_status_enum,
    feature_type_enum,
    asset_state_enum,
    audit_action_enum
FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO :"app_db_user";
GRANT USAGE ON TYPE
    user_role_enum,
    registration_status_enum,
    feature_type_enum,
    asset_state_enum,
    audit_action_enum
TO :"app_db_user";

GRANT SELECT, INSERT, UPDATE ON
    users,
    user_sessions,
    password_reset_tokens,
    pending_admin_transfer,
    locations,
    categories,
    features,
    assets,
    asset_specs
TO :"app_db_user";

GRANT SELECT, INSERT ON audit_logs TO :"app_db_user";

GRANT USAGE ON SEQUENCE
    users_user_id_seq,
    user_sessions_session_id_seq,
    password_reset_tokens_reset_token_id_seq,
    pending_admin_transfer_transfer_id_seq,
    locations_location_id_seq,
    categories_category_id_seq,
    features_feature_id_seq,
    assets_asset_id_seq,
    asset_specs_spec_id_seq,
    audit_logs_log_id_seq
TO :"app_db_user";
EOSQL
