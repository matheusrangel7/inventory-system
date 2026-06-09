# Convenções do Backend

O backend mantém uma arquitetura simples baseada em `routes`, `services`,
`models`, `domain`, `security` e `utils`. Estas convenções orientam novas
funcionalidades sem introduzir camadas que o projeto ainda não necessita.

## Responsabilidades

- `routes` trata detalhes HTTP: request, validação superficial do payload,
  autenticação/autorização e construção da response.
- `services` contém regras de negócio, consultas e alterações de estado.
- `models` representa o schema persistido pelo SQLAlchemy.
- `domain` contém conceitos estáveis partilhados, como roles e estados.
- `security` contém a matriz de permissões e decisões de autorização.
- `utils` fica reservado a helpers técnicos sem regras de negócio.

Rotas não devem decidir quando executar `commit()` ou `rollback()`.

## Transações

Uma operação pública de service deve deixar claro quem controla a transação:

- operações simples fazem o próprio `commit()` depois de todas as validações;
- funções que apenas participam num fluxo composto usam nomes explícitos como
  `apply_*` e não fazem `commit()` ou `rollback()`;
- fluxos que combinam vários services usam um coordenador dedicado;
- o coordenador executa um único `commit()` quando todas as etapas têm sucesso
  e um `rollback()` em qualquer falha anterior ao commit;
- emails e outros efeitos externos são executados apenas depois do commit.

O fluxo em `mfa_enrollment_service.py` é a referência atual para operações
compostas.

## Estados de domínio

Roles e estados persistidos são definidos como `StrEnum` em
`app/domain/enums.py`.

- o valor do enum deve ser exatamente o texto persistido no PostgreSQL;
- models, services, autorização e testes devem reutilizar esses enums;
- respostas da API continuam a expor os mesmos valores textuais;
- adicionar ou renomear valores exige rever o schema SQL e os contratos da API.
