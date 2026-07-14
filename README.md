# <img src="frontend/assets/ubi-logo-dark.png" alt="Logo" height="40" style="vertical-align: middle; display: inline-block; margin-right: 10px;"> <span style="color: #002566; vertical-align: middle;">InvUBI</span>

Projeto do Estágio - UBI

Sistema de gestão de inventário das salas da universidade

Autores:
* António Silva
* Matheus Rangel

## Ambiente de desenvolvimento

1. Copie `.env.example` para `.env`, defina passwords diferentes em
   `POSTGRES_PASSWORD` e `APP_DB_PASSWORD`, e gere uma chave de criptografia
   para os segredos TOTP:

```bash
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

Coloque o valor em `TOTP_ENCRYPTION_KEYS_JSON` e mantenha o respetivo ID em
`TOTP_ENCRYPTION_ACTIVE_KEY_ID`. O JSON deve ficar entre aspas simples, como no
`.env.example`. Sem um keyring válido, o backend não arranca.

2. Reconstrua a base de dados quando alterar os scripts de `db/init`:

```bash
docker compose down -v
docker compose up -d --build
```

3. Crie o primeiro administrador de forma interativa:

```bash
docker compose exec backend flask --app 'app:create_app()' bootstrap-admin
```

O backend liga-se à base de dados com `APP_DB_USER`. A conta `POSTGRES_USER`
fica reservada para bootstrap e manutenção.

Os dados opcionais de demonstração podem ser carregados seguindo
[`db/seeds/README.md`](db/seeds/README.md).

## HTTPS local com mkcert

O Nginx espera os certificados locais em `nginx/certs/nginx.crt` e
`nginx/certs/nginx.key`. Estes ficheiros pertencem à máquina de desenvolvimento
e não devem ser versionados.

Instale o `mkcert` seguindo a documentação oficial:
[`FiloSottile/mkcert`](https://github.com/FiloSottile/mkcert).

Depois gere os certificados usados pelo projeto:

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

Em desenvolvimento, mantenha `APP_BASE_URL=https://localhost` e
`NGINX_HSTS_VALUE=max-age=0`.

## Headers de segurança

O Nginx aplica CSP e os restantes headers de segurança. O valor de HSTS deve
ser ajustado ao ambiente:

```env
# Desenvolvimento local
NGINX_HSTS_VALUE=max-age=0

# Produção, apenas após HTTPS definitivo em todos os subdomínios
NGINX_HSTS_VALUE=max-age=31536000; includeSubDomains
```

Não use `preload` antes de validar o domínio e todos os subdomínios.

Para validar a política estática do frontend e do Nginx:

```bash
python scripts/check_security_hardening.py
```

## Demonstração com Cloudflare Tunnel

Para expor a aplicação via Cloudflare Tunnel, crie um tunnel gerido no
Dashboard do Cloudflare Zero Trust e associe o hostname público:

```text
Hostname: invubi.pt
Service: https://frontend:443
```

Como o origin interno usa o certificado local do Nginx, ative `No TLS Verify`
nas definições TLS do origin. O TLS público continua a ser tratado pela
Cloudflare.

Copie `.env.tunnel.example` para `.env.tunnel` e preencha
`CLOUDFLARED_TOKEN` com o token gerado pela Cloudflare. O ficheiro
`.env.tunnel` não deve ser versionado.

Antes de subir em modo Tunnel, confirme que `SECRET_KEY`, `JWT_SECRET_KEY` e
`APP_DB_PASSWORD` têm valores fortes. Estes valores podem vir do `.env` ou ser
sobrescritos no `.env.tunnel`. Como o backend usa `FLASK_ENV=production`, a app
não arranca com segredos fracos nem com rate limit em memória. Se alterar
`APP_DB_PASSWORD` numa instalação descartável, recrie o volume com
`docker compose down -v` para manter a password do utilizador da base de dados
alinhada.

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

O ambiente de demonstração usa Redis para rate limiting partilhado, cookies
seguros, CSRF ativo, validação de origem e HSTS com
`max-age=31536000; includeSubDomains`. Nesta etapa, mantenha o `preload`
desativado.
