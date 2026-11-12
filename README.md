# Abraço Animal

App mobile e API da ONG **Abraço Animal**, que resgata cavalos e outros animais em situação de
abuso e é mantida 100% por doações.

## Estrutura

```
apps/
  api/            Fastify + Prisma (monólito modular, Clean Architecture)
  mobile/         App Expo (SDK 58): Splash, Onboarding e Login
packages/
  shared/         Enums e regras compartilhadas entre API e app
  ui/             Design system (tokens + 10 componentes)
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

Portas (somente `127.0.0.1`): API `3333`, Postgres `5433`, Redis `6379`, S3 `8333`, Mailpit `8025` (e-mails de teste).

## Abrir o app no celular

1. Instale o **Expo Go** (Play Store / App Store) — versão atual, compatível com o SDK 58.
2. Com o celular e o computador na mesma rede Wi-Fi:

```bash
pnpm --filter @abraco/mobile start
```

3. Escaneie o QR code exibido no terminal (Android: pelo Expo Go; iPhone: pela câmera).

> Se a rede bloquear a conexão (Wi-Fi da faculdade, por exemplo), use
> `pnpm --filter @abraco/mobile start --tunnel`.

## Comandos

| Comando                                | O que faz                               |
| -------------------------------------- | --------------------------------------- |
| `pnpm verify`                          | formatação + lint + typecheck + testes  |
| `pnpm dev`                             | API em modo watch (lê o `.env` da raiz) |
| `pnpm --filter @abraco/api db:migrate` | cria/aplica migração em desenvolvimento |

## Documentação

- [Etapa 1 — schema, diff e OpenAPI](docs/etapa-1/)
- [Etapa 2 — decisões do monorepo](docs/etapa-2/decisoes.md)
- [Design system e decisão de contraste](docs/design/design-system.md)
