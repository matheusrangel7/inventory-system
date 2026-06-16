# <img src="frontend/assets/ubi-logo-dark.png" alt="Logo" height="40" style="vertical-align: middle; display: inline-block; margin-right: 10px;"> <span style="color: #002566; vertical-align: middle;">InvUBI</span>

Projeto do Estágio - UBI

Sistema de gestão de inventário das salas da universidade

By:
* António Silva
* Matheus Rangel

## Ambiente de desenvolvimento

1. Copie `.env.example` para `.env`, defina passwords diferentes para
   `POSTGRES_PASSWORD` e `APP_DB_PASSWORD` e gere uma chave de criptografia
   TOTP:

```bash
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

Use o valor em `TOTP_ENCRYPTION_KEYS_JSON` e mantenha o respetivo ID em
`TOTP_ENCRYPTION_ACTIVE_KEY_ID`. Mantenha o JSON entre aspas simples, como no
`.env.example`. O backend não arranca sem um keyring válido.
2. Reconstrua a base de dados quando alterar os scripts de `db/init`:

```bash
docker compose down -v
docker compose up -d --build
```

3. Crie o primeiro Administrador de forma interativa:

```bash
docker compose exec backend flask --app 'app:create_app()' bootstrap-admin
```

O backend conecta-se como `APP_DB_USER`. A conta `POSTGRES_USER` existe apenas
para bootstrap e manutenção da base de dados.

Dados opcionais para demonstração podem ser carregados seguindo
[`db/seeds/README.md`](db/seeds/README.md).

## Headers de segurança

O Nginx aplica CSP e os restantes headers de segurança em todos os ambientes.
O HSTS varia por configuração:

```env
# Desenvolvimento local
NGINX_HSTS_VALUE=max-age=0

# Produção, apenas após HTTPS definitivo em todos os subdomínios
NGINX_HSTS_VALUE=max-age=31536000; includeSubDomains
```

Não ative `preload` antes de validar o domínio e todos os seus subdomínios.

Valide a política estática do frontend e do Nginx com:

```bash
python scripts/check_security_hardening.py
```
