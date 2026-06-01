INSERT INTO users (
    email,
    password_hash,
    role,
    registration_status,
    registration_token_hash,
    registration_token_expires_at,
    mfa_enabled, -- Use authy, google authenticator, etc...
    created_at,
    is_active
)
VALUES (
    'admin@ubi.pt',
    '$argon2id$v=19$m=65536,t=3,p=4$KXaeMIw8/TDscAThtFksrA$bdUM25jkLPlIpGSVhe+VCJMm+uMG3GOEX90ZaST95ws', -- admin123
    'Administrador',
    'Concluído',
    NULL,
    NULL,
    FALSE,
    CURRENT_TIMESTAMP,
    TRUE
)
ON CONFLICT (email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    registration_status = EXCLUDED.registration_status,
    registration_token_hash = EXCLUDED.registration_token_hash,
    registration_token_expires_at = EXCLUDED.registration_token_expires_at,
    totp_secret = EXCLUDED.totp_secret,
    mfa_enabled = EXCLUDED.mfa_enabled,
    is_active = EXCLUDED.is_active;
