# Abraço Animal

App mobile e API da ONG **Abraço Animal**, que resgata cavalos e outros animais em situação de
abuso e é mantida 100% por doações.

## Estrutura

```
apps/
  api/            Fastify + Prisma (monólito modular, Clean Architecture)
  mobile/         App Expo (SDK 58)
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

O celular precisa alcançar a API e as fotos **pela rede local**. O `docker-compose.yml` só
publica em `127.0.0.1`, então para o celular a API roda fora do Docker e o S3 usa um arquivo extra.

1. Instale o **Expo Go** (Play Store / App Store) — versão atual, compatível com o SDK 58.
2. Descubra o IP do computador na rede (Windows: `ipconfig` → "Endereço IPv4" do adaptador
   ligado ao roteador; ignore VPNs como Radmin/Hamachi).
3. Configure os endereços com esse IP:
   - `apps/mobile/.env` (copie de `apps/mobile/.env.example`): `EXPO_PUBLIC_API_URL=http://<IP>:3333`
   - `.env` da raiz: `S3_ENDPOINT_PUBLICO=http://<IP>:8333`
4. Libere as portas no firewall **só para a rede local** (PowerShell como administrador, uma vez):

```powershell
New-NetFirewallRule -DisplayName "Abraco Animal (dev)" -Direction Inbound -Protocol TCP -LocalPort 3333,8081,8333 -RemoteAddress LocalSubnet -Action Allow
```

5. Suba os serviços, a API e o app (cada um no seu terminal):

```bash
docker compose -f docker-compose.yml -f docker-compose.celular.yml up -d postgres redis s3 mailpit
pnpm dev                                    # API em 0.0.0.0:3333
pnpm --filter @abraco/mobile start --clear  # escaneie o QR code no Expo Go
```

**Primeiro admin e dados de exemplo** — crie sua conta pelo app e depois:

```bash
pnpm --filter @abraco/api criar-admin seu@email.com   # saia e entre de novo no app
pnpm --filter @abraco/api semear                      # animais, posts e uma notícia
```

**"Não foi possível falar com o servidor"?** Em desenvolvimento a mensagem mostra o endereço
que o app tentou usar.

- Se aparecer `localhost`, o terminal tem uma `EXPO_PUBLIC_API_URL` antiga, que vence o
  arquivo `.env`. Confira com `echo $env:EXPO_PUBLIC_API_URL` e abra um terminal novo (ou
  defina a variável antes do `start`).
- Se o `pnpm dev` acusar porta 3333 em uso (`EADDRINUSE`), é a API do Docker ligada: rode
  `docker compose stop api` e suba o `pnpm dev` de novo.
- Se o endereço estiver certo, abra `http://<IP>:3333/health/ready` no navegador do celular.
  Se não abrir, o problema é a API parada, o firewall ou a rede (Wi-Fi de convidados isola os
  aparelhos).

> Se a rede bloquear a conexão (Wi-Fi da faculdade, por exemplo), use
> `pnpm --filter @abraco/mobile start --tunnel` para o app — a API ainda precisa ser alcançável.

## Comandos

| Comando                                          | O que faz                               |
| ------------------------------------------------ | --------------------------------------- |
| `pnpm verify`                                    | formatação + lint + typecheck + testes  |
| `pnpm dev`                                       | API em modo watch (lê o `.env` da raiz) |
| `pnpm --filter @abraco/api db:migrate`           | cria/aplica migração em desenvolvimento |
| `pnpm --filter @abraco/api criar-admin <e-mail>` | promove uma conta existente a admin     |
| `pnpm --filter @abraco/api semear`               | dados de exemplo (só fora de produção)  |

## Documentação

- [Etapa 1 — schema, diff e OpenAPI](docs/etapa-1/)
- [Etapa 2 — decisões do monorepo](docs/etapa-2/decisoes.md)
- [Design system e decisão de contraste](docs/design/design-system.md)
