# Etapa 10a — Contrato gerado e cliente da API

Primeira parte (não visual) da Etapa 10. As telas aguardam os protótipos do Paper.

## O que mudou

| Antes                                     | Agora                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/etapa-1/openapi.yaml` escrito à mão | `packages/api-client/openapi.json` **gerado das rotas** (`@fastify/swagger` + esquemas Zod) |
| Contrato podia divergir do código         | `pnpm api:gerar` + **CI falha** se as rotas mudarem sem regenerar                           |
| `packages/api-client` vazio               | Tipos gerados (`openapi-typescript`) + cliente tipado (`openapi-fetch`) + WebSocket         |

O YAML da Etapa 1 ficou como registro histórico (com aviso no topo).

## Cliente HTTP

| Comportamento          | Como                                                                                           | Teste                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| Token em toda chamada  | `Authorization: Bearer` a partir de `obterToken()` (o app mantém o access token só na memória) | ✅                         |
| Token expirado         | 401 → **uma** renovação para N chamadas simultâneas → repete cada uma com o token novo         | ✅ 5 chamadas, 1 renovação |
| Repetir com corpo      | Cópia da `Request` guardada antes do envio (corpo só pode ser lido uma vez)                    | ✅                         |
| Sessão perdida         | Renovação falhou → `aoPerderSessao()` e o 401 vira `ErroApi`                                   | ✅                         |
| Login com senha errada | 401 em `/v1/auth/*` **não** tenta renovar                                                      | ✅                         |
| Erros                  | `ErroApi` com `codigo`, erros por campo e `Retry-After`; `ErroRede` para falta de conexão      | ✅                         |
| Uploads                | Funções multipart tipadas pelas respostas do OpenAPI                                           | ✅                         |

## Chat em tempo real (`ChatTempoReal`)

| Comportamento                        | Como                                                                        | Teste |
| ------------------------------------ | --------------------------------------------------------------------------- | ----- |
| Autenticação                         | Token na 1ª mensagem, nunca na URL                                          | ✅    |
| Queda de rede                        | Reconecta com espera de 1 s, 2 s, 4 s… até 30 s (+ variação aleatória)      | ✅    |
| Token expirado (4401)                | Renova e reconecta; sem sessão, para                                        | ✅    |
| Logout                               | `desconectar()` fecha e não reconecta                                       | ✅    |
| Rede móvel / proxy                   | `ping` a cada 25 s                                                          | ✅    |
| Eventos desconhecidos ou malformados | Ignorados (**bug pego pelo teste**: antes um JSON qualquer virava "evento") | ✅    |

## Segurança de quebra

Como o contrato vem do código, um teste verifica **todas as 94 operações**: nenhuma resposta
tem `senha`, `cpf`, `dataNasc`, hashes, `pspTxId` ou `idempotencyKey`.

## Dependências novas

| Pacote                            | Onde       | Por quê                                                                               |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `@fastify/swagger` 9.9.3          | api        | Previsto na spec. Só é registrado no script de geração (sem rota de docs em produção) |
| `openapi-fetch` 0.17.0            | api-client | Cliente HTTP tipado de ~6 KB sobre o `fetch` nativo (sem axios)                       |
| `openapi-typescript` 7.13.0 (dev) | api-client | Gera os tipos TypeScript do OpenAPI                                                   |

## Números

- api-client: 16 testes; API: 375 unitários (2 novos) e 133 de integração.
