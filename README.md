# <img src="frontend/assets/ubi-logo-dark.png" alt="Logo" height="40" style="vertical-align: middle; display: inline-block; margin-right: 10px;"> <span style="color: #002566; vertical-align: middle;">InvUBI</span>

Projeto do Estágio - UBI

Sistema de gestão de inventário das salas da universidade

By:
* António Silva
* Matheus Rangel

## Ambiente de desenvolvimento

1. Copie `.env.example` para `.env` e defina passwords diferentes para
   `POSTGRES_PASSWORD` e `APP_DB_PASSWORD`.
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
