# Etapa 11a — Observabilidade da API (Sentry + OpenTelemetry)

## Dependência nova

| Pacote                 | Por quê                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@sentry/node` 11.12.0 | Erros e rastreamento num pacote só. O SDK é construído sobre o OpenTelemetry: os spans de HTTP, Fastify, Postgres (`pg`) e Redis vêm da instrumentação OTel. Plano gratuito do Sentry basta para a ONG |

Versão fixada com mais de duas semanas de publicada (a 11.19 tinha dias): tempo para a comunidade achar problemas.

## Como funciona

- `src/instrumentacao.ts` é carregado **antes** do resto (`node --import ./dist/instrumentacao.js dist/main.js`;
  no `pnpm dev`, `tsx --import`). A instrumentação OTel precisa entrar antes de `fastify`, `pg` e `ioredis`.
- **Sem `SENTRY_DSN` nada é ligado** (desenvolvimento, testes, CI).
- Erros 5xx são capturados pela integração do Fastify; 4xx (regra de negócio) não.
- `Sentry.close()` no desligamento envia o que ficou na fila.

## Dados pessoais (seção 6: nunca CPF, senha, token ou e-mail)

Na v11 o SDK **coleta por padrão** corpo das requisições, cabeçalhos, parâmetros das consultas
ao banco, argumentos das filas e variáveis locais dos stack traces. Tudo isso está desligado:

| Camada                    | O que faz                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `dataCollection`          | Desliga usuário, cookies, cabeçalhos, corpos, query, dados de consultas, filas, variáveis |
| Integrações removidas     | `Console`, `LocalVariablesAsync`, `Pino` (logs podem ter qualquer coisa)                  |
| `beforeSend` (erros)      | Remove usuário, extras e corpo/cabeçalhos da requisição; URL sem query; redige textos     |
| `beforeSendSpan` (traces) | Nome e atributos de URL sem query; e-mail, CPF, JWT e `Bearer` redigidos em todo texto    |
| `ignoreSpans`             | Health checks não geram spans                                                             |

As regras puras têm testes (`src/observabilidade/sentry.test.ts`).

## Também nesta parte

- `TRUST_PROXY_HOPS` (padrão 0): quantos proxies confiáveis há na frente da API. Com 0, o
  `X-Forwarded-For` é ignorado (senão qualquer um forjaria o IP e escaparia do limite por IP).
  Atrás do load balancer da hospedagem, use 1.

## Variáveis novas (`.env.example`)

`TRUST_PROXY_HOPS`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`.

## Verificação

- Sem DSN: `Sentry.isInitialized()` é `false`. Com DSN de teste: coleta toda desligada e
  integrações ativas Http, Fastify, Redis e Postgres (conferido com `node --import`).
- O build da imagem Docker fica para a CI (11b) — o Docker Desktop estava fechado.
