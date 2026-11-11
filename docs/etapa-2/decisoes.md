# Etapa 2 — Decisões do monorepo

## Versões e desvios da spec

| Item            | Spec              | Usado                                    | Motivo                                                                                                                       |
| --------------- | ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Node            | 22 LTS            | **24 LTS** (24.22.x)                     | O 22 sai de suporte em abr/2027. Decisão do usuário.                                                                         |
| S3 local        | `minio/minio`     | **SeaweedFS 4.52**                       | A MinIO deixou de publicar imagens comunitárias (`minio/minio` e `quay.io/minio/minio` retornam 404). Decisão do usuário.    |
| TypeScript      | —                 | **6.0.3**                                | O TS 7 (compilador em Go) não é suportado pelo typescript-eslint 8 (`typescript <6.1`), que é necessário para o lint tipado. |
| Prisma          | —                 | **7.10.1**                               | Última estável; a tag `latest` do npm aponta para uma RC da 8.                                                               |
| Redis           | 7                 | **7.4.12**                               | Mantido na 7 como a spec pede (o Redis 8 mudou de licença).                                                                  |
| Postgres        | 16                | **16.15-alpine**, porta **5433** no host | A 5432 já é usada por um PostgreSQL instalado no Windows.                                                                    |
| Imagem de build | —                 | `node:24.22.2-trixie-slim`               | A tag 24.22.3 ainda não tinha imagem amd64 publicada.                                                                        |
| Runtime         | distroless node22 | `distroless/nodejs24-debian13:nonroot`   | Mesmo Debian da imagem de build (glibc compatível com módulos nativos).                                                      |

## Dependências adicionadas (justificativa)

| Pacote                                                 | Onde      | Por quê                                                      |
| ------------------------------------------------------ | --------- | ------------------------------------------------------------ |
| `turbo`                                                | raiz      | orquestra tarefas do monorepo com cache (pedido na spec)     |
| `typescript`, `@types/node`                            | raiz      | TypeScript estrito                                           |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | raiz      | lint com regras tipadas (`strictTypeChecked`)                |
| `eslint-config-prettier`, `prettier`                   | raiz      | formatação sem conflito com o lint                           |
| `vitest`                                               | raiz      | testes (pedido na spec)                                      |
| `fastify`                                              | api       | servidor HTTP (pedido na spec) — por ora só os health checks |
| `prisma`                                               | api (dev) | migrações e validação do schema                              |
| `tsx`                                                  | api (dev) | roda TypeScript em modo watch no desenvolvimento, sem build  |

## Segurança já ativa

- **Cadeia de suprimentos:** `minimumReleaseAge` de 3 dias (versões recém-publicadas são recusadas) e
  scripts de instalação só para pacotes aprovados (`allowBuilds`: prisma, @prisma/engines, esbuild).
- **Arquitetura imposta pelo lint:** `modules/*/domain` não pode importar Fastify, Prisma, Redis,
  BullMQ, Express, AWS SDK, Sharp nem as camadas externas; `application` não importa
  `infrastructure`/`http`. Testado com um arquivo de violação proposital.
- **Logs:** lista de campos redigidos (senha, CPF, data de nascimento, e-mail, tokens, códigos,
  `Authorization`, cookies, token do webhook) aplicada desde a primeira rota.
- **Containers:** API em distroless como `nonroot`, `read_only`, `cap_drop: ALL`,
  `no-new-privileges`; todos os serviços com healthcheck; portas publicadas só em `127.0.0.1`.
- **S3:** bucket privado — leitura e upload anônimos retornam 403. Credenciais geradas a partir
  do `.env` (nenhum segredo versionado).
- **CI:** `permissions: contents: read`, checkout sem credenciais persistidas.

## Banco de dados

- Migração inicial `20261111222920_init` contém o schema completo **e** o índice único parcial de
  adoção PENDENTE (o Prisma não o gera, mas também não tenta removê-lo — verificado).
- O CI aplica as migrações num Postgres vazio e falha se houver **drift** entre schema e
  migrações (`migrate diff --exit-code`, testado nos dois sentidos).

## Pendências para próximas etapas

- `/health/ready` ainda não verifica dependências: cada módulo registra a sua no `main.ts`
  (Postgres e Redis na Etapa 3, S3 na Etapa 4).
- Pacotes internos exportam TypeScript direto (`src/index.ts`). Quando a API passar a importar
  `@abraco/shared`, o build de produção usará um bundler (Etapa 11) ou build próprio dos pacotes.
- Actions do GitHub fixadas por tag; fixar por SHA via Renovate (Etapa 11).
- E-mail em desenvolvimento: sugiro adicionar **Mailpit** ao compose na Etapa 3, para testar a
  recuperação de senha sem enviar e-mail real. Precisa de aprovação, porque não está na lista de
  serviços da spec.
