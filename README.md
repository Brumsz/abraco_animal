# Abraço Animal

App mobile e API da ONG **Abraço Animal**, que resgata cavalos e outros animais em situação de
abuso e é mantida 100% por doações.

## Estrutura

```
apps/
  api/            Fastify + Prisma (monólito modular, Clean Architecture)
  mobile/         App Expo — criado na Etapa 10
packages/
  shared/         Enums e regras compartilhadas entre API e app
  ui/             Design system (Etapa 10)
  api-client/     Cliente tipado gerado do OpenAPI (Etapa 10)
docs/             Decisões e contratos de cada etapa
infra/            Scripts dos serviços de desenvolvimento
```

## Pré-requisitos

- **pnpm 12** — o próprio pnpm baixa o **Node 24 LTS** do projeto (`devEngines`), sem alterar o Node global
- **Docker Desktop**

## Primeiros passos

```bash
cp .env.example .env          # preencha as senhas (comandos de geração no próprio arquivo)
pnpm install
docker compose up -d --build  # api, postgres, redis e s3 (SeaweedFS)
pnpm --filter @abraco/api db:deploy
curl localhost:3333/health/ready
```

Portas (somente `127.0.0.1`): API `3333`, Postgres `5433`, Redis `6379`, S3 `8333`.

## Comandos

| Comando                                | O que faz                               |
| -------------------------------------- | --------------------------------------- |
| `pnpm verify`                          | formatação + lint + typecheck + testes  |
| `pnpm dev`                             | API em modo watch (lê o `.env` da raiz) |
| `pnpm --filter @abraco/api db:migrate` | cria/aplica migração em desenvolvimento |

## Documentação

- [Etapa 1 — schema, diff e OpenAPI](docs/etapa-1/)
- [Etapa 2 — decisões do monorepo](docs/etapa-2/decisoes.md)
