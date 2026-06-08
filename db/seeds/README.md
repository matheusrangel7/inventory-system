# Dados demonstrativos

Os scripts desta pasta são opcionais. Não são executados durante o bootstrap da
base de dados e nunca devem conter utilizadores, passwords, tokens ou secrets.
Como são executados fora do Flask, destinam-se apenas a desenvolvimento/demo e
não geram eventos funcionais em `audit_logs`.

Depois de reconstruir a base, carregue os dados como o utilizador limitado da
aplicação:

```bash
docker compose exec -T db sh -c \
  'PGPASSWORD="$APP_DB_PASSWORD" psql -h 127.0.0.1 \
  -U "$APP_DB_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < db/seeds/demo_inventory.sql
```

O script é idempotente: pode ser executado novamente para restaurar os dados de
demonstração sem criar duplicados.
