# Etapa 10b — Camada de dados do app

Segunda parte (não visual) da Etapa 10: tudo o que as telas vão usar para falar com a API.
As telas em si chegam com os protótipos do Paper.

## Onde fica cada coisa

```
apps/mobile/src/
├── core/
│   ├── config.ts                 URL da API (https obrigatório fora do dev)
│   ├── armazenamento-seguro.ts   refresh token e deviceId no Keychain/Keystore
│   ├── sessao.ts                 estado da sessão (Zustand) + cliente da API + renovação
│   ├── consultas.ts              TanStack Query: retry, cache, chaves
│   └── chat.ts                   conexão única do WebSocket
└── features/<módulo>/data/hooks.ts   um arquivo de hooks por módulo
```

Módulos com hooks: auth, animais, adoções, doações de animais, Pix, apadrinhamentos,
voluntariado, institucional, feed, notícias, notificações e chat.

## Sessão

| Regra                          | Como                                                                              | Teste    |
| ------------------------------ | --------------------------------------------------------------------------------- | -------- |
| Access token nunca no disco    | Só na memória (Zustand); o disco guarda apenas o refresh token                    | ✅       |
| Refresh token protegido        | `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (fora de backups/iCloud) | —        |
| Sessão ligada ao aparelho      | `deviceId` aleatório gerado uma vez e enviado no login/refresh                    | ✅       |
| Renovação única no app inteiro | HTTP e WebSocket pedem ao mesmo tempo → uma chamada só (o refresh é de uso único) | ✅ 3 → 1 |
| Abrir o app já logado          | A splash renova a sessão guardada                                                 | ✅       |
| Refresh recusado (ex.: reuso)  | Apaga tudo do aparelho, limpa o cache e desconecta o chat                         | ✅       |
| Sem internet                   | A pessoa continua logada; as telas mostram erro de conexão                        | ✅       |
| Sair                           | Revoga na API (melhor esforço) e limpa o aparelho mesmo offline                   | ✅       |

## Consultas (TanStack Query)

- **Retry**: falta de conexão até 2×, erro 5xx 1×, erro 4xx nunca (regra de negócio não melhora repetindo).
- **Mutações nunca repetem sozinhas**: poderiam duplicar uma ação.
- **Pix**: uma `Idempotency-Key` por intenção de doar; status consultado a cada 5 s, parando
  sozinho ao confirmar, expirar ou vencer o prazo.
- **Curtida otimista**: o coração muda na hora e volta se a API falhar.
- **Chat**: mensagens novas e "visto" entram no cache pelo WebSocket, sem duplicar a mensagem
  que já veio pela REST; a conexão fecha com o app em segundo plano e, ao voltar, o que chegou
  é buscado pela REST.

## Problemas encontrados e corrigidos

| Problema                                                                                                           | Correção                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL` terminava em `/v1` e as rotas também → `/v1/v1/...`                                          | `.env.example` aponta para a raiz; a config remove um `/v1` final (`.env` antigos continuam funcionando)               |
| **Metro não resolvia `./cliente.js` → `cliente.ts`** (o app nem montaria o bundle; o Jest e o TypeScript passavam) | `metro.config.js` mapeia `.js` → `.ts` só dentro de `packages/`. Verificado com `expo export` (Android, 5.036 módulos) |
| Regex do Jest com `\.` numa string JS virava `.` e casava `.cjs` (quebrou TanStack e Zod)                          | Escape duplo `\\.`                                                                                                     |
| api-client guardava o `fetch` global na criação                                                                    | Lê o `fetch` na hora da chamada (polyfills/mocks posteriores valem)                                                    |

## Dependências novas (app)

| Pacote                          | Por quê                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `@tanstack/react-query` 5.107.1 | Prevista na spec (seção 7): cache, retry, paginação infinita e invalidação |
| `zustand` 5.1.0                 | Prevista na spec: estado da sessão (atualizado para a v5, ver Etapa 1)     |
| `expo-crypto` ~58.0.8           | UUID seguro para `deviceId` e `Idempotency-Key` (módulo oficial do Expo)   |

## Números

- App: 23 testes (14 novos); api-client: 17; pipeline 16/16.
