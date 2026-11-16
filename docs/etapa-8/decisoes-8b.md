# Etapa 8b — Feed, notícias e chat (WebSocket)

## Rotas

### Feed

| Rota                                  | Acesso                   | Observação                                                       |
| ------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `GET /v1/posts`, `GET /v1/posts/{id}` | público (token opcional) | Só publicados; `totalCurtidas` e `curtidoPorMim`                 |
| `POST/DELETE /v1/posts/{id}/curtida`  | logado                   | Idempotente (`ON CONFLICT DO NOTHING`); só em post publicado     |
| `GET/POST /v1/admin/posts`            | ADMIN                    | Criar = multipart (`legenda` + 1 a 10 `imagens`), nasce rascunho |
| `PATCH/DELETE /v1/admin/posts/{id}`   | ADMIN                    | Editar legenda / remover (apaga as imagens do bucket)            |
| `PUT /v1/admin/posts/{id}/publicacao` | ADMIN                    | Publicar/despublicar                                             |

### Jornal (notícias)

| Rota                                                   | Acesso  | Observação                                            |
| ------------------------------------------------------ | ------- | ----------------------------------------------------- |
| `GET /v1/noticias`, `GET /v1/noticias/{slug}`          | público | Só publicadas; a listagem não traz o conteúdo inteiro |
| `GET/POST /v1/admin/noticias`, `GET/PUT/DELETE …/{id}` | ADMIN   | CRUD; GET por id permite pré-visualizar rascunho      |
| `PUT /v1/admin/noticias/{id}/publicacao`               | ADMIN   | Publicar/despublicar                                  |
| `PUT/DELETE /v1/admin/noticias/{id}/imagem`            | ADMIN   | Capa (multipart, mesma proteção das fotos)            |

### Chat

| Rota                                    | Acesso        | Observação                                                |
| --------------------------------------- | ------------- | --------------------------------------------------------- |
| `GET/POST /v1/conversas`                | logado        | Minhas conversas / abrir (uma ABERTA por vez; 5/hora)     |
| `GET/POST /v1/conversas/{id}/mensagens` | dono ou ADMIN | Histórico (cursor) / enviar (30/min). Outro usuário → 403 |
| `POST /v1/conversas/{id}/lidas`         | dono ou ADMIN | "Visto" até uma mensagem (só as do outro lado)            |
| `GET /v1/admin/conversas`               | ADMIN         | Ordenadas pela mais recente; filtro por status            |
| `POST /v1/admin/conversas/{id}/assumir  | encerrar`     | ADMIN                                                     | Auditados |
| `GET /v1/ws/chat` (WebSocket)           | logado        | Eventos em tempo real (protocolo abaixo)                  |

## WebSocket

```
cliente → {tipo:"auth", token}            primeira mensagem, em até 5 s (nunca na URL)
cliente → {tipo:"digitando", conversaId}
cliente → {tipo:"ping"}                    → {tipo:"pong"}
servidor → auth.ok | mensagem.nova | mensagem.lida | conversa.encerrada | digitando | erro
```

| Proteção                                                 | Como                                                                                             | Teste                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| Token fora da URL                                        | Vai na 1ª mensagem (URLs aparecem em logs/proxies)                                               | ✅                       |
| Sem autenticação                                         | Fecha com 4401 em 5 s, ou na 1ª mensagem que não seja `auth`                                     | ✅                       |
| Token inválido / sessão revogada (logout)                | 4401 na autenticação; conexão aberta é derrubada em até 1 min após o logout                      | ✅                       |
| Token expirado durante a conexão                         | Fecha na hora do `exp`; o app reconecta (ou reenvia `auth`) com o token renovado                 | —                        |
| Outro site abrindo o WebSocket (CSWSH)                   | `Origin` de navegador fora do CORS → 403 no upgrade (o app nativo não manda Origin)              | ✅                       |
| Rajada / mensagens grandes                               | > 30 mensagens / 10 s → 4429; > 4 KB → conexão derrubada                                         | ✅                       |
| Formato inesperado (ex.: tentar enviar mensagem pelo WS) | Zod estrito → 4400. Mensagem de chat só pela REST (validação + rate limit)                       | ✅                       |
| Quem recebe o quê                                        | Dono da conversa + equipe; "digitando" só para o outro lado; id interno do dono nunca vai ao app | ✅                       |
| Várias instâncias da API                                 | Eventos via **Redis pub/sub** (conexão de assinatura própria)                                    | ✅ Redis real nos testes |

## Decisões

| Tema                    | Decisão                                                                                                           | Motivo                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Texto rico das notícias | **Markdown** sanitizado com `sanitize-html` (remove TODO HTML) + destinos de link só http(s)/mailto/#/relativos   | A spec cita DOMPurify server-side, que exige jsdom (pesado). Conflito apontado na Etapa 1 (#7)     |
| Links com entidades     | `java&#115;cript:` não passa: a lista de destinos é de **permitidos**, não de proibidos                           | Defesa contra disfarces                                                                            |
| Bug pego pelo teste     | Destino com parênteses (`javascript:alert(1)`) deixava um `)` sobrando; regex agora aceita parênteses balanceados | Inofensivo, mas o texto ficava errado                                                              |
| Slug                    | Gerado do título (sem acentos); repetido ganha `-2`, `-3`; **não muda** ao editar o título                        | Links compartilhados continuam funcionando                                                         |
| Uma conversa aberta     | Índice único parcial `conversas_aberta_unica` (migração); o CI confere que ele existe                             | Organiza o atendimento e resiste a cliques simultâneos (testado)                                   |
| Quem atende             | Só ADMIN; a primeira resposta da equipe assume a conversa                                                         | Interpretação de "voluntário acessa chat com a equipe" (seção 5): voluntário conversa como usuário |
| Notificação de chat     | Uma não lida por conversa (não uma por mensagem)                                                                  | Não lotar o sino                                                                                   |
| Curtidas                | `curtidoPorMim` sem nunca expor a lista de quem curtiu                                                            | Privacidade                                                                                        |
| `request.ip` ausente    | O rate limit global passou a tolerar `ip` indefinido (antes dava 500 no upgrade injetado em teste)                | Robustez; em produção o IP sempre existe                                                           |

## Dependências novas

| Pacote                                    | Por quê                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `@fastify/websocket` 11.3.7               | Plugin oficial do Fastify (usa `ws`, a biblioteca de WebSocket mais usada no Node) |
| `sanitize-html` 2.18.2                    | Sanitização com parser de HTML de verdade (regex é burlável: `<scr<script>ipt>`)   |
| `@types/sanitize-html`, `@types/ws` (dev) | Só tipos                                                                           |

## Testes

| Tipo                                | Quantidade     |
| ----------------------------------- | -------------- |
| Unitários da API (todos os módulos) | 362            |
| Integração (todos os módulos)       | 126 (24 novos) |

Cobertura de domínio + casos de uso: **97,7% linhas / 89,8% ramos** (meta 85%).

Fumaça no docker-compose com rede real: a resposta da equipe chega ao WebSocket do usuário em
~50 ms via Redis pub/sub. Origem maliciosa → 403. O token nunca vai na URL e os logs não têm
token nem senha.
