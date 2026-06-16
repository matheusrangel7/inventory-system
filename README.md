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

## HTTPS local com mkcert

O Nginx espera certificados locais em `nginx/certs/nginx.crt` e
`nginx/certs/nginx.key`. Estes ficheiros são privados da máquina e não devem ser
versionados.

Instale o `mkcert` seguindo a documentação oficial:
[`FiloSottile/mkcert`](https://github.com/FiloSottile/mkcert).

Depois gere os certificados esperados pelo projeto:

```bash
mkcert -install
mkdir -p nginx/certs
mkcert -cert-file nginx/certs/nginx.crt \
       -key-file nginx/certs/nginx.key \
       localhost 127.0.0.1 ::1
docker compose up -d --build frontend
```

Confirme que os certificados continuam ignorados pelo Git:

```bash
git check-ignore -v nginx/certs/nginx.crt nginx/certs/nginx.key
```

Em desenvolvimento mantenha `APP_BASE_URL=https://localhost` e
`NGINX_HSTS_VALUE=max-age=0`.

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

## Demonstração com Cloudflare Tunnel

Para expor a aplicação via Cloudflare Tunnel, crie um tunnel gerido pelo
Dashboard em Cloudflare Zero Trust e associe o hostname público:

```text
Hostname: invubi.pt
Service: https://frontend:443
```

Como o origin interno usa o certificado local do Nginx, ative `No TLS Verify`
nas definições TLS do origin. O TLS público continua a ser fornecido pela
Cloudflare.

Copie `.env.tunnel.example` para `.env.tunnel` e preencha
`CLOUDFLARED_TOKEN` com o token gerado pela Cloudflare. Não versione
`.env.tunnel`.

Antes de subir em modo Tunnel, confirme que `SECRET_KEY`, `JWT_SECRET_KEY` e
`APP_DB_PASSWORD` são fortes. Eles podem estar no `.env` ou ser sobrescritos no
`.env.tunnel`. Como o backend usa `FLASK_ENV=production`, ele não arranca com
segredos fracos ou rate limit em memória. Se alterar `APP_DB_PASSWORD` numa
instalação descartável, recrie o volume com `docker compose down -v` para a
password do utilizador da base ficar alinhada.

Suba a stack de demonstração com:

```bash
docker compose --env-file .env \
  --env-file .env.tunnel \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  up -d --build
```

Valide:

```bash
docker compose --env-file .env \
  --env-file .env.tunnel \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  ps
docker compose --env-file .env \
  --env-file .env.tunnel \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  logs -f cloudflared
curl -I https://invubi.pt/login
curl -I https://invubi.pt/api/health
```

O ambiente de demonstração usa Redis para rate limit compartilhado, cookies
seguros, CSRF ativo, validação de origem ativa e HSTS com
`max-age=31536000; includeSubDomains`. Não ative `preload` nesta etapa.
